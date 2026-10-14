package api

import (
	"errors"
	"net/http"

	"serverui/server/internal/appstore"
)

func (s *Server) storeApps(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	statuses, err := s.store.Statuses(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": statuses})
}

func (s *Server) startStoreJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		AppID    string `json:"appId"`
		Action   string `json:"action"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	id, err := bodyOrQueryServerID(r, body.ServerID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	job, err := s.store.Start(id, body.AppID, appstore.Action(body.Action))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) storeJob(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	job, err := s.store.Get(id, r.PathValue("job"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// writeStoreError maps the store's own errors, then defers to writeError.
func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, appstore.ErrUnknownApp), errors.Is(err, appstore.ErrJobNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, appstore.ErrUnsupported):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case errors.Is(err, appstore.ErrBusy):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeError(w, err)
	}
}
