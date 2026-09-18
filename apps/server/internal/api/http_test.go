package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestListenAddrDefault(t *testing.T) {
	t.Setenv("HTTP_PORT", "")
	t.Setenv("SERVERUI_LISTEN_HOST", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "")
	if ListenAddr() != ":8080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrLoopback(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_LISTEN_HOST", "127.0.0.1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	if ListenAddr() != "127.0.0.1:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrDesktopForcesLoopback(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "tok")
	t.Setenv("SERVERUI_LISTEN_HOST", "0.0.0.0")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "")
	if ListenAddr() != "127.0.0.1:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestListenAddrDesktopOverrideRequiresExplicitFlag(t *testing.T) {
	t.Setenv("HTTP_PORT", "18080")
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "tok")
	t.Setenv("SERVERUI_LISTEN_HOST", "0.0.0.0")
	t.Setenv("SERVERUI_ALLOW_NON_LOOPBACK", "1")
	if ListenAddr() != "0.0.0.0:18080" {
		t.Fatalf("got %q", ListenAddr())
	}
}

func TestLocalAuthRejectsMissingToken(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthRejectsAuthorizationBearer(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Authorization", "Bearer test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthAcceptsHeader(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set(LocalAuthHeader, "test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestLocalAuthAcceptsQuery(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz?localToken=test-local-token-value", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthAcceptsWebSocketProtocol(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Sec-WebSocket-Protocol", LocalAuthWSProtocolPrefix+"test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthDisabledWhenUnset(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLocalAuthAllowsOptionsWithoutToken(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/api/servers", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestDesktopCORSRejectsForeignOrigin(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/api/servers", nil)
	req.Header.Set("Origin", "https://evil.example.test")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("should not reflect foreign origin")
	}
}

func TestDesktopCORSAllowsLocalhost(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "test-local-token-value")
	t.Setenv("SERVERUI_DESKTOP", "1")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set(LocalAuthHeader, "test-local-token-value")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("cors %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestParseByteRange(t *testing.T) {
	start, end, ok := parseByteRange("bytes=0-99", 1000)
	if !ok || start != 0 || end != 99 {
		t.Fatalf("got %d %d %v", start, end, ok)
	}
	start, end, ok = parseByteRange("bytes=100-", 250)
	if !ok || start != 100 || end != 249 {
		t.Fatalf("suffix open range: %d %d %v", start, end, ok)
	}
	if _, _, ok := parseByteRange("bytes=500-10", 100); ok {
		t.Fatal("invalid range should fail")
	}
}

func TestCORSPreflight(t *testing.T) {
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	t.Setenv("SERVERUI_DESKTOP", "")
	handler := (&Server{}).Handler()
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("cors %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestOriginAllowedHelpers(t *testing.T) {
	t.Setenv("SERVERUI_DESKTOP", "1")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "x")
	if !originAllowed("tauri://localhost") {
		t.Fatal("tauri origin")
	}
	if originAllowed("https://evil.example.test") {
		t.Fatal("foreign origin")
	}
	t.Setenv("SERVERUI_DESKTOP", "")
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	if !originAllowed("https://app.example.test") {
		t.Fatal("web should reflect")
	}
}

func TestSelectedWebSocketProtocol(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ws/terminal", nil)
	req.Header.Set("Sec-WebSocket-Protocol", "chat, "+LocalAuthWSProtocolPrefix+"abc")
	got := SelectedWebSocketProtocol(req)
	if !strings.HasPrefix(got, LocalAuthWSProtocolPrefix) {
		t.Fatalf("got %q", got)
	}
}
