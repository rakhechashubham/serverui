package appstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
)

type State string

const (
	StateRunning State = "running"
	StateDone    State = "done"
	StateFailed  State = "failed"
)

const (
	detectTimeout   = 25 * time.Second
	jobTimeout      = 15 * time.Minute
	finishedJobTTL  = 10 * time.Minute
	logLinesKept    = 200
	maxLogLineBytes = 400
)

var (
	ErrUnknownApp  = errors.New("unknown app")
	ErrUnsupported = errors.New("this action is not available for this app")
	ErrBusy        = errors.New("this app is already being changed on this server")
	ErrJobNotFound = errors.New("job not found")
)

// Runner executes a shell command on a server, streaming stdout lines.
type Runner interface {
	Stream(ctx context.Context, serverID, command string, onLine func(string)) ([]byte, error)
}

// Status is what the UI needs to draw one card.
type Status struct {
	ID        string   `json:"id"`
	Installed bool     `json:"installed"`
	Version   string   `json:"version,omitempty"`
	Actions   []Action `json:"actions"`
}

// Job is the public snapshot of an install, update or removal.
type Job struct {
	ID     string   `json:"id"`
	AppID  string   `json:"appId"`
	Action Action   `json:"action"`
	State  State    `json:"state"`
	Log    []string `json:"log"`
	Error  string   `json:"error,omitempty"`
}

type job struct {
	Job
	serverID string
	finished time.Time
}

type Service struct {
	run  Runner
	mu   sync.Mutex
	jobs map[string]*job
}

func New(run Runner) *Service {
	return &Service{run: run, jobs: map[string]*job{}}
}

// Statuses reports every catalogue app with its installed version and the
// actions that make sense right now.
func (s *Service) Statuses(ctx context.Context, serverID string) ([]Status, error) {
	ctx, cancel := context.WithTimeout(ctx, detectTimeout)
	defer cancel()

	var out []string
	_, err := s.run.Stream(ctx, serverID, remoteCommand(detectScript()), func(line string) {
		out = append(out, line)
	})
	if err != nil {
		return nil, err
	}
	return parseStatuses(out), nil
}

func parseStatuses(lines []string) []Status {
	versions := map[string]string{}
	for _, line := range lines {
		id, version, ok := strings.Cut(strings.TrimSpace(line), "\t")
		if ok {
			versions[id] = strings.TrimSpace(version)
		}
	}
	statuses := make([]Status, 0, len(Catalog))
	for _, app := range Catalog {
		version, installed := versions[app.ID]
		st := Status{ID: app.ID, Installed: installed, Version: version, Actions: []Action{}}
		if installed {
			st.Actions = appendIf(st.Actions, ActionUpdate, app.Update != "")
			st.Actions = appendIf(st.Actions, ActionRemove, app.Remove != "")
		} else {
			st.Actions = appendIf(st.Actions, ActionInstall, app.Install != "")
		}
		statuses = append(statuses, st)
	}
	return statuses
}

func appendIf(actions []Action, action Action, ok bool) []Action {
	if ok {
		return append(actions, action)
	}
	return actions
}

// Start launches an action in the background and returns its job right away.
func (s *Service) Start(serverID, appID string, action Action) (Job, error) {
	app, ok := find(appID)
	if !ok {
		return Job{}, ErrUnknownApp
	}
	script := app.script(action)
	if script == "" {
		return Job{}, ErrUnsupported
	}

	s.mu.Lock()
	s.purgeLocked()
	for _, j := range s.jobs {
		if j.serverID == serverID && j.AppID == appID && j.State == StateRunning {
			s.mu.Unlock()
			return Job{}, ErrBusy
		}
	}
	j := &job{
		Job:      Job{ID: newID(), AppID: appID, Action: action, State: StateRunning, Log: []string{}},
		serverID: serverID,
	}
	s.jobs[j.ID] = j
	snapshot := j.snapshot()
	s.mu.Unlock()

	go s.execute(j, script)
	return snapshot, nil
}

func (s *Service) execute(j *job, script string) {
	ctx, cancel := context.WithTimeout(context.Background(), jobTimeout)
	defer cancel()

	_, err := s.run.Stream(ctx, j.serverID, remoteCommand(prelude+script), func(line string) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if len(line) > maxLogLineBytes {
			line = line[:maxLogLineBytes]
		}
		j.Log = append(j.Log, line)
		if len(j.Log) > logLinesKept {
			j.Log = j.Log[len(j.Log)-logLinesKept:]
		}
	})

	var verifyErr error
	if err == nil {
		verifyErr = s.verify(ctx, j)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	j.finished = time.Now()
	switch {
	case verifyErr != nil:
		j.State = StateFailed
		j.Error = verifyErr.Error()
	case err != nil:
		j.State = StateFailed
		j.Error = failureMessage(j.Log, err)
	default:
		j.State = StateDone
	}
}

// verify detects again after a script exits 0: installers can print usage or an
// error and still succeed, and "done" must mean the app is really there (or gone).
// A detection that cannot run is not held against the job.
func (s *Service) verify(ctx context.Context, j *job) error {
	statuses, err := s.Statuses(ctx, j.serverID)
	if err != nil {
		return nil
	}
	for _, st := range statuses {
		if st.ID != j.AppID {
			continue
		}
		if j.Action == ActionRemove && st.Installed {
			return errors.New("the removal finished but the app is still on the server")
		}
		if j.Action != ActionRemove && !st.Installed {
			return errors.New("the script finished but the app is not on the server. Check the log above")
		}
	}
	return nil
}

// failureMessage prefers the script's own last line (it already explains the
// failure, e.g. "root or passwordless sudo is required") over the exit status.
func failureMessage(log []string, err error) string {
	if n := len(log); n > 0 && strings.TrimSpace(log[n-1]) != "" {
		return strings.TrimSpace(log[n-1])
	}
	return err.Error()
}

func (s *Service) Get(serverID, jobID string) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[jobID]
	if !ok || j.serverID != serverID {
		return Job{}, ErrJobNotFound
	}
	return j.snapshot(), nil
}

// snapshot copies the log so callers never share the slice with the runner.
// The caller holds s.mu.
func (j *job) snapshot() Job {
	out := j.Job
	out.Log = append([]string{}, j.Log...)
	return out
}

func (s *Service) purgeLocked() {
	for id, j := range s.jobs {
		if j.State != StateRunning && time.Since(j.finished) > finishedJobTTL {
			delete(s.jobs, id)
		}
	}
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
