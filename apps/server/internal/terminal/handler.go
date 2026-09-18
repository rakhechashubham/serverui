package terminal

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	sshx "serverui/server/internal/ssh"
)

type Handler struct {
	pool *sshx.Pool
}

func New(pool *sshx.Pool) *Handler {
	return &Handler{pool: pool}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Auth is enforced by the API middleware before Upgrade.
		// Origin allowlisting for desktop also happens there via CORS.
		return true
	},
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

type resizeMsg struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	serverID := strings.TrimSpace(r.URL.Query().Get("serverId"))
	if serverID == "" {
		serverID = strings.TrimSpace(r.URL.Query().Get("server"))
	}
	if serverID == "" {
		http.Error(w, `{"error":"server id is required"}`, http.StatusBadRequest)
		return
	}

	var responseHeader http.Header
	if proto := selectedLocalAuthProtocol(r); proto != "" {
		responseHeader = http.Header{}
		responseHeader.Set("Sec-WebSocket-Protocol", proto)
	}

	ws, err := upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		return
	}
	defer ws.Close()

	client, err := h.pool.Ensure(serverID)
	if err != nil {
		_ = ws.WriteJSON(map[string]string{
			"type":    "error",
			"message": sshx.PublicError(err),
		})
		return
	}

	session, err := client.NewSession()
	if err != nil {
		_ = ws.WriteJSON(map[string]string{"type": "error", "message": "unable to start terminal"})
		return
	}
	defer session.Close()

	cols, rows := 120, 32
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		_ = ws.WriteJSON(map[string]string{"type": "error", "message": "unable to allocate terminal"})
		return
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return
	}
	if err := session.Shell(); err != nil {
		_ = ws.WriteJSON(map[string]string{"type": "error", "message": "unable to start shell"})
		return
	}

	_ = ws.WriteJSON(map[string]string{"type": "status", "status": "connected"})

	var writeMu sync.Mutex
	done := make(chan struct{})
	var once sync.Once
	closeDone := func() { once.Do(func() { close(done) }) }

	copyOut := func(reader io.Reader) {
		buf := make([]byte, 4096)
		for {
			n, readErr := reader.Read(buf)
			if n > 0 {
				writeMu.Lock()
				_ = ws.SetWriteDeadline(time.Now().Add(15 * time.Second))
				writeErr := ws.WriteMessage(websocket.BinaryMessage, buf[:n])
				writeMu.Unlock()
				if writeErr != nil {
					closeDone()
					return
				}
			}
			if readErr != nil {
				return
			}
		}
	}

	go copyOut(stdout)
	go copyOut(stderr)
	go func() {
		_ = session.Wait()
		closeDone()
	}()
	go func() {
		<-done
		_ = ws.Close()
	}()

	for {
		kind, payload, err := ws.ReadMessage()
		if err != nil {
			_ = session.Close()
			return
		}
		switch kind {
		case websocket.BinaryMessage:
			if _, err := stdin.Write(payload); err != nil {
				return
			}
		case websocket.TextMessage:
			var msg resizeMsg
			if json.Unmarshal(payload, &msg) == nil && msg.Type == "resize" {
				if msg.Cols > 0 && msg.Rows > 0 {
					_ = session.WindowChange(clampSize(msg.Rows, 1, 200), clampSize(msg.Cols, 1, 500))
				}
				continue
			}
			if _, err := stdin.Write(payload); err != nil {
				return
			}
		}
	}
}

func clampSize(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

const localAuthWSProtocolPrefix = "serverui-local."

func selectedLocalAuthProtocol(r *http.Request) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(p, localAuthWSProtocolPrefix) {
			return p
		}
	}
	return ""
}
