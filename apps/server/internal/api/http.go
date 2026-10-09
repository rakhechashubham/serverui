package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"serverui/server/internal/appstore"
	"serverui/server/internal/archive"
	"serverui/server/internal/codeserver"
	"serverui/server/internal/filesystem"
	"serverui/server/internal/metrics"
	"serverui/server/internal/servers"
	sshx "serverui/server/internal/ssh"
	"serverui/server/internal/terminal"
)

type Server struct {
	servers  *servers.Service
	metrics  *metrics.Collector
	files    *filesystem.Service
	archives *archive.Service
	store    *appstore.Service
	code     *codeserver.Service
	term     *terminal.Handler
}

func New(svc *servers.Service, collector *metrics.Collector, files *filesystem.Service, archives *archive.Service, store *appstore.Service, code *codeserver.Service, term *terminal.Handler) *Server {
	return &Server{servers: svc, metrics: collector, files: files, archives: archives, store: store, code: code, term: term}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)

	mux.HandleFunc("GET /api/servers", s.listServers)
	mux.HandleFunc("POST /api/servers", s.createServer)
	mux.HandleFunc("GET /api/servers/{id}", s.getServer)
	mux.HandleFunc("PUT /api/servers/{id}", s.updateServer)
	mux.HandleFunc("DELETE /api/servers/{id}", s.deleteServer)
	mux.HandleFunc("POST /api/servers/test-connection", s.testServerDraft)
	mux.HandleFunc("POST /api/servers/{id}/test-connection", s.testServer)
	mux.HandleFunc("POST /api/servers/{id}/connect", s.connectServer)
	mux.HandleFunc("POST /api/servers/{id}/disconnect", s.disconnectServer)
	mux.HandleFunc("GET /api/servers/{id}/status", s.serverStatus)

	mux.HandleFunc("GET /api/server", s.legacyServer)
	mux.HandleFunc("GET /api/server/metrics", s.liveMetrics)
	mux.HandleFunc("GET /api/server/process", s.processInspect)
	mux.HandleFunc("POST /api/server/process/kill", s.processKill)
	mux.HandleFunc("POST /api/server/service", s.controlService)

	mux.HandleFunc("GET /api/applications", s.placeholder("applications"))
	mux.HandleFunc("GET /api/databases", s.placeholder("databases"))
	mux.HandleFunc("GET /api/domains", s.placeholder("domains"))
	mux.HandleFunc("GET /api/files", s.listFiles)
	mux.HandleFunc("GET /api/files/read", s.readFile)
	mux.HandleFunc("GET /api/files/download", s.downloadFile)
	mux.HandleFunc("PUT /api/files/write", s.writeFile)
	mux.HandleFunc("POST /api/files/write", s.writeFile)
	mux.HandleFunc("POST /api/files/create", s.createFile)
	mux.HandleFunc("POST /api/files/mkdir", s.mkdir)
	mux.HandleFunc("POST /api/files/rename", s.rename)
	mux.HandleFunc("POST /api/files/copy", s.transfer(s.files.Copy))
	mux.HandleFunc("POST /api/files/move", s.transfer(s.files.Move))
	mux.HandleFunc("POST /api/files/compress", s.compress)
	mux.HandleFunc("POST /api/files/upload", s.upload)
	mux.HandleFunc("DELETE /api/files", s.deleteFile)
	mux.HandleFunc("POST /api/files/extract", s.startExtract)
	mux.HandleFunc("GET /api/files/extract/{job}", s.extractStatus)
	mux.HandleFunc("POST /api/files/extract/{job}/resolve", s.resolveExtract)
	mux.HandleFunc("DELETE /api/files/extract/{job}", s.cancelExtract)
	mux.HandleFunc("GET /api/store/apps", s.storeApps)
	mux.HandleFunc("POST /api/store/jobs", s.startStoreJob)
	mux.HandleFunc("GET /api/store/jobs/{job}", s.storeJob)
	mux.HandleFunc("POST /api/code/{id}/start", s.startCode)
	mux.HandleFunc("/api/code/{id}/", s.proxyCode)
	mux.HandleFunc("/api/code/{id}", s.proxyCodeRoot)
	if s.term != nil {
		mux.Handle("/ws/terminal", s.term)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Cache-Control, Pragma, Range, "+LocalAuthHeader)
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type, Content-Disposition")
		}
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		if r.Method == http.MethodOptions {
			if origin != "" && !originAllowed(origin) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		expected := localAuthToken()
		if expected != "" && !tokenMatches(requestLocalToken(r), expected) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type serverBody struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"authType"`
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
}

func (b serverBody) input() servers.Input {
	return servers.Input{
		Name:       b.Name,
		Host:       b.Host,
		Port:       b.Port,
		Username:   b.Username,
		AuthType:   b.AuthType,
		Password:   b.Password,
		PrivateKey: b.PrivateKey,
	}
}

func (s *Server) listServers(w http.ResponseWriter, r *http.Request) {
	items, err := s.servers.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	if items == nil {
		items = []servers.Public{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": items})
}

func (s *Server) createServer(w http.ResponseWriter, r *http.Request) {
	var body serverBody
	if err := decodeJSON(w, r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	item, err := s.servers.Create(r.Context(), body.input())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) getServer(w http.ResponseWriter, r *http.Request) {
	item, err := s.servers.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.withMetrics(item, false))
}

func (s *Server) updateServer(w http.ResponseWriter, r *http.Request) {
	var body serverBody
	if err := decodeJSON(w, r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	item, err := s.servers.Update(r.Context(), r.PathValue("id"), body.input())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) deleteServer(w http.ResponseWriter, r *http.Request) {
	if err := s.servers.Delete(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	s.metrics.Invalidate(r.PathValue("id"))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) testServer(w http.ResponseWriter, r *http.Request) {
	result, err := s.servers.Test(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// testServerDraft checks unsaved connection details; serverId is set when editing.
func (s *Server) testServerDraft(w http.ResponseWriter, r *http.Request) {
	var body struct {
		serverBody
		ServerID string `json:"serverId"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	result, err := s.servers.TestDraft(r.Context(), strings.TrimSpace(body.ServerID), body.input())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) connectServer(w http.ResponseWriter, r *http.Request) {
	item, err := s.servers.Connect(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error":  sshx.PublicError(err),
			"server": item,
		})
		return
	}
	writeJSON(w, http.StatusOK, s.withMetrics(item, false))
}

func (s *Server) disconnectServer(w http.ResponseWriter, r *http.Request) {
	item, err := s.servers.Disconnect(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	s.metrics.Invalidate(item.ID)
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) serverStatus(w http.ResponseWriter, r *http.Request) {
	s.getServer(w, r)
}

func (s *Server) legacyServer(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	item, err := s.servers.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.withMetrics(item, false))
}

func (s *Server) liveMetrics(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	item, err := s.servers.Get(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.withMetrics(item, true))
}

func (s *Server) processInspect(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	pid, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("pid")))
	if err != nil || pid <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pid is required"})
		return
	}
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	detail, err := s.metrics.InspectProcess(id, pid)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": sshx.PublicError(err)})
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) processKill(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		PID      int    `json:"pid"`
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
	if body.PID <= 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "refusing to signal this process"})
		return
	}
	if _, err := s.servers.Get(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	if err := s.metrics.KillProcess(id, body.PID); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": sshx.PublicError(err)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "pid": body.PID})
}

func (s *Server) controlService(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		Name     string `json:"name"`
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
	if err := s.metrics.ControlService(id, body.Name, body.Action); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": sshx.PublicError(err)})
		return
	}
	s.metrics.Invalidate(id)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": body.Name, "action": body.Action})
}

func (s *Server) withMetrics(item servers.Public, wait bool) map[string]any {
	payload := map[string]any{
		"id":            item.ID,
		"name":          item.Name,
		"hostname":      "",
		"status":        item.Status,
		"host":          item.Host,
		"port":          item.Port,
		"username":      item.Username,
		"authType":      item.AuthType,
		"cpuUsage":      0,
		"memoryUsage":   0,
		"diskUsage":     0,
		"uptimeSeconds": 0,
		"lastSeen":      item.LastSeen,
		"createdAt":     item.CreatedAt,
		"updatedAt":     item.UpdatedAt,
	}
	if item.Error != "" {
		payload["error"] = item.Error
	}
	if item.Status != servers.StatusOnline {
		return payload
	}
	var snap metrics.Snapshot
	var snapErr error
	ok := true
	if wait {
		snap, snapErr = s.metrics.Snapshot(item.ID)
		ok = snapErr == nil
	} else {
		s.metrics.RefreshAsync(item.ID)
		snap, snapErr, ok = s.metrics.Cached(item.ID)
	}
	attachSnapshot(payload, snap)
	if (!ok || wait) && snapErr != nil {
		payload["error"] = sshx.PublicError(snapErr)
	}
	return payload
}

func attachSnapshot(payload map[string]any, snap metrics.Snapshot) {
	if snap.Hostname != "" {
		payload["hostname"] = snap.Hostname
	}
	payload["cpuUsage"] = snap.CPUUsage
	payload["cpuUser"] = snap.CPUUser
	payload["cpuSystem"] = snap.CPUSystem
	payload["cpuIowait"] = snap.CPUIowait
	payload["cpuCores"] = snap.CPUCores
	payload["cpuPhysicalCores"] = snap.CPUPhysicalCores
	payload["cpuModel"] = snap.CPUModel
	payload["cpuBaseMHz"] = snap.CPUBaseMHz
	payload["cpuMaxMHz"] = snap.CPUMaxMHz
	payload["cpuTempC"] = snap.CPUTempC
	payload["l1CacheBytes"] = snap.L1CacheBytes
	payload["l2CacheBytes"] = snap.L2CacheBytes
	payload["l3CacheBytes"] = snap.L3CacheBytes
	if snap.Cores == nil {
		payload["cores"] = []metrics.CoreUsage{}
	} else {
		payload["cores"] = snap.Cores
	}
	payload["memoryUsage"] = snap.MemoryUsage
	payload["memoryUsedBytes"] = snap.MemoryUsedBytes
	payload["memoryTotalBytes"] = snap.MemoryTotalBytes
	payload["memoryAvailableBytes"] = snap.MemoryAvailableBytes
	payload["memoryCachedBytes"] = snap.MemoryCachedBytes
	payload["memoryBuffersBytes"] = snap.MemoryBuffersBytes
	payload["swapTotalBytes"] = snap.SwapTotalBytes
	payload["swapUsedBytes"] = snap.SwapUsedBytes
	payload["swapFreeBytes"] = snap.SwapFreeBytes
	payload["pageFaults"] = snap.PageFaults
	payload["pageFaultsMinor"] = snap.PageFaultsMinor
	payload["pageFaultsMajor"] = snap.PageFaultsMajor
	payload["diskUsage"] = snap.DiskUsage
	payload["uptimeSeconds"] = snap.UptimeSeconds
	payload["diskUsedBytes"] = snap.DiskUsedBytes
	payload["diskTotalBytes"] = snap.DiskTotalBytes
	payload["diskFreeBytes"] = snap.DiskFreeBytes
	payload["diskReadBps"] = snap.DiskReadBps
	payload["diskWriteBps"] = snap.DiskWriteBps
	payload["diskReadIops"] = snap.DiskReadIops
	payload["diskWriteIops"] = snap.DiskWriteIops
	payload["diskDevice"] = snap.DiskDevice
	payload["diskModel"] = snap.DiskModel
	payload["diskType"] = snap.DiskType
	payload["diskFSType"] = snap.DiskFSType
	payload["diskMountOptions"] = snap.DiskMountOptions
	payload["diskTempC"] = snap.DiskTempC
	if snap.DiskMounts == nil {
		payload["diskMounts"] = []metrics.DiskMount{}
	} else {
		payload["diskMounts"] = snap.DiskMounts
	}
	payload["load1"] = snap.Load1
	payload["load5"] = snap.Load5
	payload["load15"] = snap.Load15
	payload["osName"] = snap.OSName
	payload["kernel"] = snap.Kernel
	payload["arch"] = snap.Arch
	payload["virtualization"] = snap.Virtualization
	payload["ipAddress"] = snap.IPAddress
	payload["dockerVersion"] = snap.DockerVersion
	payload["containerCount"] = snap.ContainerCount
	payload["netRxBps"] = snap.NetRxBps
	payload["netTxBps"] = snap.NetTxBps
	payload["netRxBytes"] = snap.NetRxBytes
	payload["netTxBytes"] = snap.NetTxBytes
	payload["netConns"] = snap.NetConns
	payload["netEstablished"] = snap.NetEstablished
	payload["netListenPorts"] = snap.NetListenPorts
	if snap.NetListenPorts == nil {
		payload["netListenPorts"] = []int{}
	}
	payload["netIface"] = snap.NetIface
	payload["netIfaceType"] = snap.NetIfaceType
	payload["netMAC"] = snap.NetMAC
	payload["netIPv4"] = snap.NetIPv4
	payload["netIPv6"] = snap.NetIPv6
	payload["netSubnet"] = snap.NetSubnet
	payload["netGateway"] = snap.NetGateway
	payload["netDNS"] = snap.NetDNS
	if snap.NetProcesses == nil {
		payload["netProcesses"] = []metrics.NetProcess{}
	} else {
		payload["netProcesses"] = snap.NetProcesses
	}
	payload["processCount"] = snap.ProcessCount
	payload["processUserCount"] = snap.ProcessUserCount
	payload["processSysCount"] = snap.ProcessSysCount
	payload["processRunning"] = snap.ProcessRunning
	if snap.Processes == nil {
		payload["processes"] = []metrics.Process{}
	} else {
		payload["processes"] = snap.Processes
	}
	if snap.Services == nil {
		payload["services"] = []metrics.Service{}
	} else {
		payload["services"] = snap.Services
	}
	payload["serviceRunning"] = snap.ServiceRunning
	payload["serviceStopped"] = snap.ServiceStopped
	payload["serviceFailed"] = snap.ServiceFailed
	payload["serviceOther"] = snap.ServiceOther
	if snap.History == nil {
		payload["history"] = []metrics.HistoryPoint{}
	} else {
		payload["history"] = snap.History
	}
}

func (s *Server) placeholder(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := requestServerID(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if _, err := s.servers.Get(r.Context(), id); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			kind:     []any{},
			"status": "coming_soon",
		})
	}
}

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	path := r.URL.Query().Get("path")
	if path == "~" {
		// "~" lists the user's real home, which is not always /home/<user>.
		if path, err = s.files.Home(id); err != nil {
			writeError(w, err)
			return
		}
	}
	entries, err := s.files.List(id, path)
	if err != nil {
		writeError(w, err)
		return
	}
	cleaned, err := filesystem.CleanPath(path)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    cleaned,
		"entries": entries,
	})
}

func (s *Server) readFile(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	preview, err := s.files.Preview(id, r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (s *Server) writeFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
		Content  string `json:"content"`
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
	if strings.TrimSpace(body.Path) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	if err := s.files.Write(id, body.Path, []byte(body.Content)); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) createFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
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
	if err := s.files.Create(id, body.Path); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) mkdir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		Path     string `json:"path"`
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
	if err := s.files.Mkdir(id, body.Path); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type transferFunc func(ctx context.Context, serverID, from, to string, overwrite bool) error

func (s *Server) transfer(op transferFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ServerID  string `json:"serverId"`
			From      string `json:"from"`
			To        string `json:"to"`
			Overwrite bool   `json:"overwrite"`
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
		if err := op(r.Context(), id, body.From, body.To, body.Overwrite); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (s *Server) compress(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID  string   `json:"serverId"`
		Dir       string   `json:"dir"`
		Names     []string `json:"names"`
		Archive   string   `json:"archive"`
		Format    string   `json:"format"`
		Overwrite bool     `json:"overwrite"`
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
	archive, err := s.files.Compress(r.Context(), id, body.Dir, body.Names, body.Archive, body.Format, body.Overwrite)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": archive})
}

func (s *Server) rename(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		From     string `json:"from"`
		To       string `json:"to"`
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
	if err := s.files.Rename(id, body.From, body.To); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := s.files.Delete(id, r.URL.Query().Get("path")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) startExtract(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID    string `json:"serverId"`
		Path        string `json:"path"`
		Destination string `json:"destination"`
		Mode        string `json:"mode"`
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
	job, err := s.archives.Start(id, body.Path, body.Destination, archive.Mode(body.Mode))
	if err != nil {
		writeArchiveError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

func (s *Server) extractStatus(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	job, err := s.archives.Get(id, r.PathValue("job"))
	if err != nil {
		writeArchiveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) resolveExtract(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServerID string `json:"serverId"`
		Policy   string `json:"policy"`
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
	job, err := s.archives.Resolve(id, r.PathValue("job"), archive.Policy(body.Policy))
	if err != nil {
		writeArchiveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) cancelExtract(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	job, err := s.archives.Cancel(id, r.PathValue("job"))
	if err != nil {
		writeArchiveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// writeArchiveError adds the archive-only statuses to writeError's mapping.
func writeArchiveError(w http.ResponseWriter, err error) {
	if errors.Is(err, archive.ErrBusy) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": err.Error()})
		return
	}
	writeError(w, err)
}

func (s *Server) downloadFile(w http.ResponseWriter, r *http.Request) {
	id, err := requestServerID(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	file, info, client, err := s.files.Download(id, r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, err)
		return
	}
	defer client.Close()
	defer file.Close()

	mime := filesystem.MIME(info.Name())
	if mime == "application/octet-stream" && info.Size() > 0 && info.Size() <= 64<<10 {
		sample := make([]byte, min(4096, info.Size()))
		n, _ := file.Read(sample)
		mime = filesystem.DetectMIME(info.Name(), sample[:n])
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			writeError(w, err)
			return
		}
	}
	forceDownload := r.URL.Query().Get("download") == "1"
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Accept-Ranges", "bytes")
	disposition := "inline"
	if forceDownload || !filesystem.Inline(mime) {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("%s; filename=%q", disposition, info.Name()))

	size := info.Size()
	rangeHeader := r.Header.Get("Range")
	if rangeHeader == "" {
		w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
		_, _ = io.Copy(w, file)
		return
	}

	start, end, ok := parseByteRange(rangeHeader, size)
	if !ok {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", size))
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if _, err := file.Seek(start, io.SeekStart); err != nil {
		writeError(w, err)
		return
	}
	length := end - start + 1
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, size))
	w.Header().Set("Content-Length", strconv.FormatInt(length, 10))
	w.WriteHeader(http.StatusPartialContent)
	_, _ = io.CopyN(w, file, length)
}

func parseByteRange(header string, size int64) (start, end int64, ok bool) {
	if size <= 0 {
		return 0, 0, false
	}
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(header, "bytes=") {
		return 0, 0, false
	}
	spec := strings.TrimPrefix(header, "bytes=")
	if strings.Contains(spec, ",") {
		return 0, 0, false
	}
	parts := strings.Split(spec, "-")
	if len(parts) != 2 {
		return 0, 0, false
	}
	if parts[0] == "" {
		suffix, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffix <= 0 {
			return 0, 0, false
		}
		if suffix > size {
			suffix = size
		}
		return size - suffix, size - 1, true
	}
	start, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || start < 0 || start >= size {
		return 0, 0, false
	}
	if parts[1] == "" {
		return start, size - 1, true
	}
	end, err = strconv.ParseInt(parts[1], 10, 64)
	if err != nil || end < start {
		return 0, 0, false
	}
	if end >= size {
		end = size - 1
	}
	return start, end, true
}

func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<20)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload"})
		return
	}
	id := strings.TrimSpace(r.FormValue("serverId"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "server id is required"})
		return
	}
	dir := r.FormValue("path")
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload"})
		return
	}
	defer file.Close()
	if header.Filename == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid upload"})
		return
	}
	target, err := filesystem.Join(dir, header.Filename)
	if err != nil {
		writeError(w, err)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, 32<<20))
	if err != nil {
		writeError(w, err)
		return
	}
	if err := s.files.Write(id, target, data); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": target})
}

func requestServerID(r *http.Request) (string, error) {
	id := strings.TrimSpace(r.URL.Query().Get("serverId"))
	if id == "" {
		id = strings.TrimSpace(r.URL.Query().Get("server"))
	}
	if id == "" {
		return "", fmt.Errorf("server id is required")
	}
	return id, nil
}

func bodyOrQueryServerID(r *http.Request, bodyID string) (string, error) {
	id := strings.TrimSpace(bodyID)
	if id == "" {
		return requestServerID(r)
	}
	return id, nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	decoder := json.NewDecoder(r.Body)
	return decoder.Decode(dest)
}

func writeError(w http.ResponseWriter, err error) {
	if err == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request failed"})
		return
	}
	if errors.Is(err, servers.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "server not found"})
		return
	}
	if errors.Is(err, filesystem.ErrExists) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	var opErr *filesystem.OpError
	if errors.As(err, &opErr) {
		code := http.StatusBadRequest
		if opErr.Permission {
			code = http.StatusForbidden
		}
		writeJSON(w, code, map[string]string{"error": opErr.Message})
		return
	}
	msg := err.Error()
	code := http.StatusBadRequest
	switch {
	case strings.Contains(msg, "not found"):
		code = http.StatusNotFound
	case strings.Contains(msg, "permission denied"):
		code = http.StatusForbidden
	case strings.Contains(msg, "passphrase-protected"):
		code = http.StatusBadRequest
	case strings.Contains(msg, "authenticate"),
		strings.Contains(msg, "authentication"),
		strings.Contains(msg, "unable to connect"),
		strings.Contains(msg, "ssh"):
		code = http.StatusBadGateway
		msg = sshx.PublicError(err)
	}
	writeJSON(w, code, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
