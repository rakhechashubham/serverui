// Package codeserver starts code-server on a server and reverse-proxies it
// through the existing SSH connection. code-server listens on a Unix socket
// with mode 600, so only the SSH user can reach it: nothing is exposed on a
// network port, and no password is needed on top of ServerUI's own access.
package codeserver

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

var (
	ErrNotInstalled = errors.New("code-server is not installed on this server")
	ErrNotStarted   = errors.New("VS Code is not running on this server, start it first")
)

// Runner executes a shell command on a server, streaming stdout lines.
type Runner interface {
	Stream(ctx context.Context, serverID, command string, onLine func(string)) ([]byte, error)
}

// DialFunc opens a connection to a Unix socket on a server (over SSH).
type DialFunc func(serverID, socket string) (net.Conn, error)

// SSHDial dials through the pooled SSH client of a server.
func SSHDial(ensure func(serverID string) (*ssh.Client, error)) DialFunc {
	return func(serverID, socket string) (net.Conn, error) {
		client, err := ensure(serverID)
		if err != nil {
			return nil, err
		}
		return client.Dial("unix", socket)
	}
}

// startScript prints "SOCKET=<abs path>" once code-server answers /healthz.
// It also records the pid so removing the app can stop it.
const startScript = `exec 2>&1
export PATH="$HOME/.local/bin:$PATH"
command -v code-server >/dev/null 2>&1 || { echo "NOT_INSTALLED"; exit 1; }
D="$HOME/.local/share/serverui"; S="$D/code-server.sock"
mkdir -p "$D"
up() { curl -sf --max-time 2 --unix-socket "$S" http://localhost/healthz >/dev/null 2>&1; }
if ! up; then
  rm -f "$S"
  setsid nohup code-server --socket "$S" --socket-mode 600 --auth none --disable-telemetry --disable-update-check >"$D/code-server.log" 2>&1 </dev/null &
  echo $! > "$D/code-server.pid"
  i=0
  while ! up; do
    i=$((i+1))
    if [ "$i" -ge 40 ]; then echo "code-server did not start in time"; tail -n 5 "$D/code-server.log"; exit 1; fi
    sleep 0.5
  done
fi
echo "SOCKET=$S"
`

type Service struct {
	run  Runner
	dial DialFunc

	mu      sync.Mutex
	proxies map[string]*proxy
}

type proxy struct {
	socket  string
	handler *httputil.ReverseProxy
}

func New(run Runner, dial DialFunc) *Service {
	return &Service{run: run, dial: dial, proxies: map[string]*proxy{}}
}

// Start makes sure code-server is running and reachable, and remembers where.
func (s *Service) Start(ctx context.Context, serverID string) error {
	cmd := `sh -c "$(printf %s ` + base64.StdEncoding.EncodeToString([]byte(startScript)) + ` | base64 -d)"`
	var lines []string
	_, err := s.run.Stream(ctx, serverID, cmd, func(line string) { lines = append(lines, line) })

	socket := ""
	for _, line := range lines {
		if strings.TrimSpace(line) == "NOT_INSTALLED" {
			return ErrNotInstalled
		}
		if path, ok := strings.CutPrefix(strings.TrimSpace(line), "SOCKET="); ok {
			socket = path
		}
	}
	if err != nil || socket == "" {
		return fmt.Errorf("%s", lastLines(lines, err))
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.proxies[serverID]; !ok || existing.socket != socket {
		s.proxies[serverID] = s.newProxy(serverID, socket)
	}
	return nil
}

func lastLines(lines []string, err error) string {
	if n := len(lines); n > 0 {
		from := max(0, n-3)
		return strings.Join(lines[from:], " ")
	}
	if err != nil {
		return err.Error()
	}
	return "unable to start VS Code"
}

// Handler proxies one request to the server's code-server, with prefix cut off.
func (s *Service) Handler(serverID, prefix string) (http.Handler, error) {
	s.mu.Lock()
	p, ok := s.proxies[serverID]
	s.mu.Unlock()
	if !ok {
		return nil, ErrNotStarted
	}
	return http.StripPrefix(prefix, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The API wrapper marks everything no-store; let code-server's own caching win.
		w.Header().Del("Cache-Control")
		w.Header().Del("Pragma")
		p.handler.ServeHTTP(w, r)
	})), nil
}

func (s *Service) newProxy(serverID, socket string) *proxy {
	transport := &http.Transport{
		DialContext: func(context.Context, string, string) (net.Conn, error) {
			return s.dial(serverID, socket)
		},
	}
	return &proxy{
		socket: socket,
		handler: &httputil.ReverseProxy{
			Transport: transport,
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = "http"
				pr.Out.URL.Host = "code-server"
				// code-server compares the WebSocket Origin with the host the
				// browser used, so hand it the public host, not our own.
				host := pr.In.Header.Get("X-Forwarded-Host")
				if host == "" {
					host = pr.In.Host
				}
				pr.Out.Host = host
				pr.Out.Header.Set("X-Forwarded-Host", host)
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
				http.Error(w, "VS Code is unreachable: "+err.Error(), http.StatusBadGateway)
			},
		},
	}
}
