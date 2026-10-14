package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"serverui/server/internal/px0"
)

const px0StartTimeout = 45 * time.Second

// startPx0 makes sure px0 runs on the server and reports the path the browser
// should open.
func (s *Server) startPx0(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), px0StartTimeout)
	defer cancel()
	if err := s.px0.Start(ctx, id); err != nil {
		code := http.StatusBadGateway
		if errors.Is(err, px0.ErrNotInstalled) {
			code = http.StatusConflict
		}
		writeJSON(w, code, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": px0.Prefix(id)})
}

// proxyPx0Root serves the bare /api/px0/{id}. Next's rewrite drops the final
// slash of /api/px0/{id}/ on its way here, and answering with a redirect would
// loop; the browser keeps the slash in its own URL, which relative links need.
func (s *Server) proxyPx0Root(w http.ResponseWriter, r *http.Request) {
	r.URL.Path = px0.Prefix(r.PathValue("id"))
	r.URL.RawPath = ""
	s.proxyPx0(w, r)
}

// proxyPx0 relays everything under /api/px0/{id}/ (pages, API and SSE).
func (s *Server) proxyPx0(w http.ResponseWriter, r *http.Request) {
	handler, err := s.px0.Handler(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	handler.ServeHTTP(w, r)
}
