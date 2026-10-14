package px0

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os/exec"
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
		lines: []string{"px0 did not start in time", "error: address in use"},
		err:   errors.New("exit status 1"),
	}, noDial)
	err := svc.Start(context.Background(), "s1")
	if err == nil || !strings.Contains(err.Error(), "address in use") {
		t.Fatalf("got %v", err)
	}
}

func TestHandlerNeedsAStart(t *testing.T) {
	svc := New(fakeRunner{}, noDial)
	if _, err := svc.Handler("s1"); !errors.Is(err, ErrNotStarted) {
		t.Fatalf("got %v", err)
	}
}

// px0 runs with -base-path set to our prefix, so the proxy keeps the full path.
// It also sends a loopback Host and lets serverui frame px0.
func TestProxyKeepsThePathAndAllowsFraming(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; form-action 'none';")
		w.Header().Set("X-Frame-Options", "DENY")
		fmt.Fprintf(w, "path=%s query=%s host=%s", r.URL.Path, r.URL.RawQuery, r.Host)
	}))
	t.Cleanup(upstream.Close)
	addr := upstream.Listener.Addr().String()

	svc := New(fakeRunner{lines: []string{"ADDR=" + addr}}, func(_, a string) (net.Conn, error) {
		return net.Dial("tcp", a)
	})
	if err := svc.Start(context.Background(), "s1"); err != nil {
		t.Fatal(err)
	}
	handler, err := svc.Handler("s1")
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/px0/s1/static/app.js?v=2", nil)
	req.Header.Set("X-Forwarded-Host", "serverui.example:3000")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	want := "path=/api/px0/s1/static/app.js query=v=2 host=" + addr
	if rec.Code != http.StatusOK || rec.Body.String() != want {
		t.Fatalf("got %d %q, want %q", rec.Code, rec.Body.String(), want)
	}
	if csp := rec.Header().Get("Content-Security-Policy"); csp != "default-src 'self'; frame-ancestors 'self'; form-action 'none';" {
		t.Fatalf("csp %q", csp)
	}
	if xfo := rec.Header().Get("X-Frame-Options"); xfo != "" {
		t.Fatalf("X-Frame-Options still set: %q", xfo)
	}
}

func TestAllowFramingRewritesEveryFrameAncestors(t *testing.T) {
	res := &http.Response{Header: http.Header{}}
	res.Header.Add("Content-Security-Policy", "default-src 'self'; Frame-Ancestors https://a.example 'self'")
	res.Header.Add("Content-Security-Policy", "frame-ancestors 'none';img-src *")
	res.Header.Set("X-Frame-Options", "SAMEORIGIN")
	allowFraming(res)
	got := res.Header.Values("Content-Security-Policy")
	want := []string{"default-src 'self'; frame-ancestors 'self'", "frame-ancestors 'self';img-src *"}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %q, want %q", got, want)
	}
	if res.Header.Get("X-Frame-Options") != "" {
		t.Fatal("X-Frame-Options still set")
	}
}

// A loopback framing page (dev UI) is added next to 'self'; a public one is not.
func TestAllowFramingAddsOnlyLocalParent(t *testing.T) {
	for referer, want := range map[string]string{
		"http://localhost:3000/":    "frame-ancestors 'self' http://localhost:3000",
		"https://evil.example/page": "frame-ancestors 'self'",
		"":                          "frame-ancestors 'self'",
	} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if referer != "" {
			req.Header.Set("Referer", referer)
		}
		res := &http.Response{Header: http.Header{}, Request: req}
		res.Header.Set("Content-Security-Policy", "frame-ancestors 'none'")
		allowFraming(res)
		if got := res.Header.Get("Content-Security-Policy"); got != want {
			t.Errorf("referer %q: got %q, want %q", referer, got, want)
		}
	}
}

// px0 checks Origin == Host on POSTs: serverui's own Origin is translated to
// the loopback address, a foreign one goes through untouched, none stays none.
func TestProxyTranslatesOnlyServeruisOrigin(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, r.Header.Get("Origin"))
	}))
	t.Cleanup(upstream.Close)
	addr := upstream.Listener.Addr().String()

	svc := New(fakeRunner{lines: []string{"ADDR=" + addr}}, func(_, a string) (net.Conn, error) {
		return net.Dial("tcp", a)
	})
	if err := svc.Start(context.Background(), "s1"); err != nil {
		t.Fatal(err)
	}
	handler, _ := svc.Handler("s1")

	for _, c := range []struct{ fwdHost, host, origin, want string }{
		{"serverui.example:3000", "backend:8080", "https://serverui.example:3000", "http://" + addr},
		{"", "serverui.example", "http://serverui.example", "http://" + addr},
		{"serverui.example:3000", "backend:8080", "https://evil.example", "https://evil.example"},
		{"serverui.example:3000", "backend:8080", "", ""},
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/px0/s1/api/session", nil)
		req.Host = c.host
		if c.fwdHost != "" {
			req.Header.Set("X-Forwarded-Host", c.fwdHost)
		}
		if c.origin != "" {
			req.Header.Set("Origin", c.origin)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Body.String() != c.want {
			t.Errorf("origin %q via %q/%q: got %q, want %q", c.origin, c.fwdHost, c.host, rec.Body.String(), c.want)
		}
	}
}
