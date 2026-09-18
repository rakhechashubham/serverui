package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"serverui/server/internal/crypto"
	"serverui/server/internal/filesystem"
	"serverui/server/internal/metrics"
	"serverui/server/internal/servers"
	sshx "serverui/server/internal/ssh"
	"serverui/server/internal/terminal"
)

func testAPI(t *testing.T) http.Handler {
	t.Helper()
	// Web/API tests expect no desktop local-auth gate.
	t.Setenv("SERVERUI_LOCAL_AUTH_TOKEN", "")
	key, err := crypto.RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := crypto.New(key)
	if err != nil {
		t.Fatal(err)
	}
	svc := servers.NewService(servers.NewMemoryStore(), box)
	svc.SetDialer(func(cfg sshx.Config, auth sshx.AuthMethod) error {
		return nil
	})
	pool := svc.Pool()
	return New(svc, metrics.NewCollector(pool), filesystem.New(pool), terminal.New(pool)).Handler()
}

func TestServerCRUDHidesCredentials(t *testing.T) {
	handler := testAPI(t)
	body := `{
		"name":"Production",
		"host":"203.0.113.10",
		"port":22,
		"username":"deploy",
		"authType":"password",
		"password":"super-secret"
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/servers", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "super-secret") {
		t.Fatal("create leaked password")
	}
	var created map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatal("missing id")
	}
	if _, ok := created["password"]; ok {
		t.Fatal("password field present")
	}
	if _, ok := created["privateKey"]; ok {
		t.Fatal("privateKey field present")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/servers", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "super-secret") {
		t.Fatal("list leaked password")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/servers/"+id, nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get %d", rec.Code)
	}

	update := `{"name":"Prod","host":"203.0.113.10","port":22,"username":"deploy","authType":"password"}`
	req = httptest.NewRequest(http.MethodPut, "/api/servers/"+id, strings.NewReader(update))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update %d %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/servers/"+id, nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/servers/"+id, nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("deleted get %d", rec.Code)
	}
}

func TestCreateRejectsInvalidHost(t *testing.T) {
	handler := testAPI(t)
	req := httptest.NewRequest(http.MethodPost, "/api/servers", bytes.NewBufferString(`{
		"name":"Bad","host":"not a host","port":22,"username":"u","authType":"password","password":"x"
	}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestFilesRequireServerID(t *testing.T) {
	handler := testAPI(t)
	req := httptest.NewRequest(http.MethodGet, "/api/files?path=/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}
