// Package px0 starts px0 (https://px0.ai) on a server and reverse-proxies it
// through the existing SSH connection. px0 has no auth and no Unix socket, so
// it listens on 127.0.0.1 only and is reached with an SSH direct-tcpip channel:
// nothing is exposed on the network, ServerUI's own access is the gate.
package px0

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"golang.org/x/crypto/ssh"
)

var (
	ErrNotInstalled = errors.New("px0 is not installed on this server")
	ErrNotStarted   = errors.New("px0 is not running on this server, start it first")
)

// Prefix is where px0 is served, for the browser and for px0's -base-path.
func Prefix(serverID string) string { return "/api/px0/" + serverID + "/" }

// Runner executes a shell command on a server, streaming stdout lines.
type Runner interface {
	Stream(ctx context.Context, serverID, command string, onLine func(string)) ([]byte, error)
}

// DialFunc opens a TCP connection to addr on a server (over SSH).
type DialFunc func(serverID, addr string) (net.Conn, error)

// SSHDial dials through the pooled SSH client of a server.
func SSHDial(ensure func(serverID string) (*ssh.Client, error)) DialFunc {
	return func(serverID, addr string) (net.Conn, error) {
		client, err := ensure(serverID)
		if err != nil {
			return nil, err
		}
		return client.Dial("tcp", addr)
	}
}

// startScript prints "ADDR=127.0.0.1:<port>" once px0 answers on the base path
// given as $1. It reuses a running px0 when the recorded port still answers.
// The port is px0's own pick (-port 0), read back from its log: choosing one in
// shell needs ss or netstat (not always there), races with other processes,
// and px0 silently walks to the next port when the asked one is taken.
// The health URL includes the base path, so an unrelated service on a reused
// port cannot pass for px0. The pid is recorded so removing the app can stop it.
const startScript = `exec 2>&1
export PATH="$HOME/.local/bin:$PATH"
command -v px0 >/dev/null 2>&1 || { echo "NOT_INSTALLED"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required to start px0"; exit 1; }
B="$1"; D="$HOME/.local/share/serverui"; L="$D/px0.log"
mkdir -p "$D"
up() { [ -n "$PORT" ] && curl -sf --max-time 2 "http://127.0.0.1:$PORT${B}api/metrics" >/dev/null 2>&1; }
PORT=$(cat "$D/px0.port" 2>/dev/null)
if ! up; then
  PORT=""
  rm -f "$D/px0.port"
  setsid nohup px0 -host 127.0.0.1 -port 0 -base-path "$B" -no-open -no-update -no-color -no-telemetry "$HOME" >"$L" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$D/px0.pid"
  i=0
  while ! up; do
    kill -0 "$PID" 2>/dev/null || { echo "px0 exited"; tail -n 5 "$L"; exit 1; }
    i=$((i+1))
    if [ "$i" -ge 40 ]; then echo "px0 did not start in time"; tail -n 5 "$L"; exit 1; fi
    sleep 0.5
    PORT=$(grep -o '127\.0\.0\.1:[0-9][0-9]*' "$L" | head -n 1 | cut -d: -f2)
  done
  echo "$PORT" > "$D/px0.port"
fi
echo "ADDR=127.0.0.1:$PORT"
`

type Service struct {
	run  Runner
	dial DialFunc

	mu       sync.Mutex
	proxies  map[string]*proxy
	starting map[string]*sync.Mutex
}

type proxy struct {
	addr      string
	transport *http.Transport
	handler   *httputil.ReverseProxy
}

func New(run Runner, dial DialFunc) *Service {
	return &Service{run: run, dial: dial, proxies: map[string]*proxy{}, starting: map[string]*sync.Mutex{}}
}

// Start makes sure px0 is running and reachable, and remembers where. Starts
// for one server run one at a time, so a double click launches px0 once.
func (s *Service) Start(ctx context.Context, serverID string) error {
	s.mu.Lock()
	lock, ok := s.starting[serverID]
	if !ok {
		lock = &sync.Mutex{}
		s.starting[serverID] = lock
	}
	s.mu.Unlock()
	lock.Lock()
	defer lock.Unlock()

	// Server IDs are generated hex, so single quotes are enough here.
	cmd := `sh -c "$(printf %s ` + base64.StdEncoding.EncodeToString([]byte(startScript)) + ` | base64 -d)" px0 '` + Prefix(serverID) + `'`
	var lines []string
	_, err := s.run.Stream(ctx, serverID, cmd, func(line string) { lines = append(lines, line) })

	addr := ""
	for _, line := range lines {
		if strings.TrimSpace(line) == "NOT_INSTALLED" {
			return ErrNotInstalled
		}
		if a, ok := strings.CutPrefix(strings.TrimSpace(line), "ADDR="); ok {
			addr = a
		}
	}
	if err != nil || addr == "" {
		return fmt.Errorf("%s", lastLines(lines, err))
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.proxies[serverID]; !ok || existing.addr != addr {
		if ok {
			existing.transport.CloseIdleConnections()
		}
		s.proxies[serverID] = s.newProxy(serverID, addr)
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
	return "unable to start px0"
}

// Handler proxies one request to the server's px0, path kept whole since px0
// serves everything under the same prefix (-base-path).
func (s *Service) Handler(serverID string) (http.Handler, error) {
	s.mu.Lock()
	p, ok := s.proxies[serverID]
	s.mu.Unlock()
	if !ok {
		return nil, ErrNotStarted
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The API wrapper marks everything no-store; px0 sets its own caching.
		w.Header().Del("Cache-Control")
		w.Header().Del("Pragma")
		p.handler.ServeHTTP(w, r)
	}), nil
}

func (s *Service) newProxy(serverID, addr string) *proxy {
	transport := &http.Transport{
		DialContext: func(context.Context, string, string) (net.Conn, error) {
			return s.dial(serverID, addr)
		},
	}
	return &proxy{
		addr:      addr,
		transport: transport,
		handler: &httputil.ReverseProxy{
			Transport: transport,
			// Flush at once: px0 pushes live updates over SSE.
			FlushInterval: -1,
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = "http"
				pr.Out.URL.Host = addr
				// px0 only trusts a loopback Host (DNS rebinding guard).
				pr.Out.Host = addr
				// px0 refuses POSTs whose Origin is not its Host. A request from
				// serverui's own page is translated; any other Origin is left as
				// is, so px0 still turns it away.
				if o, err := url.Parse(pr.In.Header.Get("Origin")); err == nil && o.Host != "" && o.Host == publicHost(pr.In) {
					pr.Out.Header.Set("Origin", "http://"+addr)
				}
			},
			ModifyResponse: allowFraming,
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
				http.Error(w, "px0 is unreachable: "+err.Error(), http.StatusBadGateway)
			},
		},
	}
}

// publicHost is the host the browser used to reach serverui.
func publicHost(r *http.Request) string {
	if h := r.Header.Get("X-Forwarded-Host"); h != "" {
		return h
	}
	return r.Host
}

// localParent is the origin of the page that framed px0, read from the Referer,
// when that page is on loopback (the dev UI on localhost:3000 talks to the API on
// 127.0.0.1:8080): the UI and the API are then different origins, so 'self'
// alone would block the window. Any other origin gives "".
func localParent(res *http.Response) string {
	if res.Request == nil {
		return ""
	}
	u, err := url.Parse(res.Request.Header.Get("Referer"))
	if err != nil || u.Host == "" {
		return ""
	}
	switch strings.ToLower(u.Hostname()) {
	case "localhost", "127.0.0.1", "::1":
		return u.Scheme + "://" + u.Host
	}
	return ""
}

// allowFraming lets serverui show px0 in one of its windows; px0 itself forbids
// any framing. Every frame-ancestors directive, whatever its value, becomes
// frame-ancestors 'self', plus the framing page's origin when it is local.
func allowFraming(res *http.Response) error {
	ancestors := "frame-ancestors 'self'"
	if p := localParent(res); p != "" {
		ancestors += " " + p
	}
	policies := res.Header.Values("Content-Security-Policy")
	for i, csp := range policies {
		directives := strings.Split(csp, ";")
		for j, d := range directives {
			trimmed := strings.TrimLeft(d, " \t")
			name, _, _ := strings.Cut(trimmed, " ")
			if strings.EqualFold(strings.TrimSpace(name), "frame-ancestors") {
				directives[j] = d[:len(d)-len(trimmed)] + ancestors
			}
		}
		policies[i] = strings.Join(directives, ";")
	}
	res.Header.Del("X-Frame-Options")
	return nil
}
