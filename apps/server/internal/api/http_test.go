package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListenAddrDefault(t *testing.T) {
	t.Setenv("HTTP_PORT", "")
	if ListenAddr() != ":8080" {
		t.Fatalf("got %q", ListenAddr())
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
