package codeserver

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type fakeRunner struct {
	lines []string
	err   error
}

func (r fakeRunner) Stream(_ context.Context, _, _ string, onLine func(string)) ([]byte, error) {
	for _, line := range r.lines {
		onLine(line)
	}
	return nil, r.err
}

func noDial(string, string) (net.Conn, error) { return nil, errors.New("no dial in this test") }

func TestStartScriptParsesAsShell(t *testing.T) {
	cmd := exec.Command("sh", "-n")
	cmd.Stdin = strings.NewReader(startScript)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("start script does not parse: %v\n%s", err, out)
	}
}

func TestStartReportsAMissingInstall(t *testing.T) {
	svc := New(fakeRunner{lines: []string{"NOT_INSTALLED"}, err: errors.New("exit status 1")}, noDial)
	if err := svc.Start(context.Background(), "s1"); !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("got %v", err)
	}
}

func TestStartFailureShowsTheScriptsLastLines(t *testing.T) {
	svc := New(fakeRunner{
		lines: []string{"code-server did not start in time", "error: address in use"},
		err:   errors.New("exit status 1"),
	}, noDial)
	err := svc.Start(context.Background(), "s1")
	if err == nil || !strings.Contains(err.Error(), "address in use") {
		t.Fatalf("got %v", err)
	}
}

func TestHandlerNeedsAStart(t *testing.T) {
	svc := New(fakeRunner{}, noDial)
	if _, err := svc.Handler("s1", "/api/code/s1"); !errors.Is(err, ErrNotStarted) {
		t.Fatalf("got %v", err)
	}
}

// The proxy must cut the prefix and hand code-server the browser's host, since
// code-server compares it with the WebSocket Origin.
func TestProxyStripsPrefixAndForwardsThePublicHost(t *testing.T) {
	dir, err := os.MkdirTemp("", "cs")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket := filepath.Join(dir, "s.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Skipf("unix sockets unavailable: %v", err)
	}
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "path=%s query=%s host=%s", r.URL.Path, r.URL.RawQuery, r.Host)
	}))
	upstream.Listener = listener
	upstream.Start()
	t.Cleanup(upstream.Close)

	svc := New(fakeRunner{lines: []string{"SOCKET=" + socket}}, func(_, sock string) (net.Conn, error) {
		return net.Dial("unix", sock)
	})
	if err := svc.Start(context.Background(), "s1"); err != nil {
		t.Fatal(err)
	}
	handler, err := svc.Handler("s1", "/api/code/s1")
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/code/s1/static/app.js?v=2", nil)
	req.Header.Set("X-Forwarded-Host", "serverui.example:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	want := "path=/static/app.js query=v=2 host=serverui.example:3000"
	if rec.Code != http.StatusOK || rec.Body.String() != want {
		t.Fatalf("got %d %q, want %q", rec.Code, rec.Body.String(), want)
	}
}
