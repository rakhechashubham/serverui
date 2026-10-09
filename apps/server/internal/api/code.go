package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"serverui/server/internal/codeserver"
)

const codeStartTimeout = 45 * time.Second

func codePrefix(serverID string) string { return "/api/code/" + serverID }

// startCode makes sure VS Code (code-server) runs on the server and reports
// the path the browser should open.
func (s *Server) startCode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), codeStartTimeout)
	defer cancel()
	if err := s.code.Start(ctx, id); err != nil {
		code := http.StatusBadGateway
		if errors.Is(err, codeserver.ErrNotInstalled) {
			code = http.StatusConflict
		}
		writeJSON(w, code, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": codePrefix(id) + "/"})
}

// proxyCodeRoot serves the bare /api/code/{id}. Next's rewrite drops the final
// slash of /api/code/{id}/ on its way here, and answering with a redirect would
// loop; the browser keeps the slash in its own URL, which relative links need.
func (s *Server) proxyCodeRoot(w http.ResponseWriter, r *http.Request) {
	r.URL.Path = codePrefix(r.PathValue("id")) + "/"
	r.URL.RawPath = ""
	s.proxyCode(w, r)
}

// proxyCode relays everything under /api/code/{id}/ (pages and WebSockets).
func (s *Server) proxyCode(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	handler, err := s.code.Handler(id, codePrefix(id))
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	handler.ServeHTTP(w, r)
}
