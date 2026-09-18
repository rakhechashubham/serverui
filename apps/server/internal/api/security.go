package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"strings"
)

// LocalAuthHeader is required on desktop when SERVERUI_LOCAL_AUTH_TOKEN is set.
const LocalAuthHeader = "X-ServerUI-Local-Token"

// LocalAuthQuery is accepted only where custom headers cannot be sent
// (media/download URLs). Prefer LocalAuthHeader for HTTP and the
// Sec-WebSocket-Protocol subprotocol for WebSockets.
const LocalAuthQuery = "localToken"

// LocalAuthWSProtocolPrefix is preferred for WebSocket auth so the token
// is not placed in the request URL (access logs, browser history).
const LocalAuthWSProtocolPrefix = "serverui-local."

// DesktopMode reports whether this process is running as a desktop-local API.
// Triggered by an explicit SERVERUI_DESKTOP=1 flag or a non-empty local auth token
// (Tauri always sets both).
func DesktopMode() bool {
	if truthy(os.Getenv("SERVERUI_DESKTOP")) {
		return true
	}
	return localAuthToken() != ""
}

func localAuthToken() string {
	return strings.TrimSpace(os.Getenv("SERVERUI_LOCAL_AUTH_TOKEN"))
}

func allowNonLoopback() bool {
	return truthy(os.Getenv("SERVERUI_ALLOW_NON_LOOPBACK"))
}

func truthy(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func requestLocalToken(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get(LocalAuthHeader)); v != "" {
		return v
	}
	if v := websocketLocalToken(r); v != "" {
		return v
	}
	return strings.TrimSpace(r.URL.Query().Get(LocalAuthQuery))
}

func websocketLocalToken(r *http.Request) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(p, LocalAuthWSProtocolPrefix) {
			return strings.TrimPrefix(p, LocalAuthWSProtocolPrefix)
		}
	}
	return ""
}

func tokenMatches(got, expected string) bool {
	if expected == "" {
		return true
	}
	if got == "" {
		return false
	}
	if len(got) != len(expected) {
		// Still compare equal-length buffers to keep timing flatter.
		dummy := make([]byte, len(expected))
		_ = subtle.ConstantTimeCompare(dummy, []byte(expected))
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(expected)) == 1
}

// ListenAddr returns the HTTP bind address.
//
// WEB / Docker: unset SERVERUI_LISTEN_HOST → ":PORT" (all interfaces).
// DESKTOP: forced to 127.0.0.1 unless SERVERUI_ALLOW_NON_LOOPBACK=1
// (developer-only escape hatch; never used by Tauri).
func ListenAddr() string {
	port := strings.TrimSpace(os.Getenv("HTTP_PORT"))
	if port == "" {
		port = "8080"
	}
	host := strings.TrimSpace(os.Getenv("SERVERUI_LISTEN_HOST"))

	if DesktopMode() && !allowNonLoopback() {
		if host == "" || !isLoopbackHost(host) {
			host = "127.0.0.1"
		}
	}
	if host == "" {
		return ":" + port
	}
	return net.JoinHostPort(host, port)
}

func isLoopbackHost(host string) bool {
	h := strings.TrimSpace(strings.ToLower(host))
	if h == "127.0.0.1" || h == "localhost" || h == "::1" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// originAllowed applies CORS reflection for web, and a tight allowlist for desktop.
func originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	if !DesktopMode() {
		return true
	}
	o := strings.TrimSpace(origin)
	switch {
	case o == "tauri://localhost",
		o == "https://tauri.localhost",
		o == "http://tauri.localhost",
		o == "https://localhost",
		o == "http://localhost",
		o == "http://127.0.0.1",
		strings.HasPrefix(o, "http://localhost:"),
		strings.HasPrefix(o, "http://127.0.0.1:"),
		strings.HasPrefix(o, "https://localhost:"),
		strings.HasPrefix(o, "https://127.0.0.1:"):
		return true
	default:
		return false
	}
}

// SelectedWebSocketProtocol returns the local-auth subprotocol to echo, if any.
func SelectedWebSocketProtocol(r *http.Request) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ",") {
		p := strings.TrimSpace(part)
		if strings.HasPrefix(p, LocalAuthWSProtocolPrefix) {
			return p
		}
	}
	return ""
}
