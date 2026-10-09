package appstore

import (
	"context"
	"errors"
	"os/exec"
	"slices"
	"strings"
	"testing"
	"time"
)

// shellRunner runs the command in a local shell, standing in for SSH.
type shellRunner struct{}

func (shellRunner) Stream(ctx context.Context, _, command string, onLine func(string)) ([]byte, error) {
	out, err := exec.CommandContext(ctx, "sh", "-c", command).Output()
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line != "" {
			onLine(line)
		}
	}
	return nil, err
}

// scriptRunner replays canned output, optionally failing at the end.
type scriptRunner struct {
	lines []string
	err   error
	gate  chan struct{}
}

func (r scriptRunner) Stream(_ context.Context, _, _ string, onLine func(string)) ([]byte, error) {
	for _, line := range r.lines {
		onLine(line)
	}
	if r.gate != nil {
		<-r.gate
	}
	return nil, r.err
}

func statusOf(t *testing.T, statuses []Status, id string) Status {
	t.Helper()
	for _, st := range statuses {
		if st.ID == id {
			return st
		}
	}
	t.Fatalf("no status for %q", id)
	return Status{}
}

func TestParseStatusesOffersActionsFromState(t *testing.T) {
	statuses := parseStatuses([]string{"git\t2.43.0", "docker\t27.0.1", "noise without tab"})

	git := statusOf(t, statuses, "git")
	if !git.Installed || git.Version != "2.43.0" || !slices.Equal(git.Actions, []Action{ActionUpdate, ActionRemove}) {
		t.Fatalf("git: %+v", git)
	}
	// Detect-only apps expose no action even when installed.
	if docker := statusOf(t, statuses, "docker"); !docker.Installed || len(docker.Actions) != 0 {
		t.Fatalf("docker: %+v", docker)
	}
	if bun := statusOf(t, statuses, "bun"); bun.Installed || !slices.Equal(bun.Actions, []Action{ActionInstall}) {
		t.Fatalf("bun: %+v", bun)
	}
	// Nothing detected for node means no install either: it is detect-only.
	if node := statusOf(t, statuses, "nodejs"); node.Installed || len(node.Actions) != 0 {
		t.Fatalf("nodejs: %+v", node)
	}
}

func TestStatusesDetectsLocalShell(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	svc := New(shellRunner{})
	statuses, err := svc.Statuses(context.Background(), "s1")
	if err != nil {
		t.Fatal(err)
	}
	if git := statusOf(t, statuses, "git"); !git.Installed || git.Version == "" || git.Version == "installed" {
		t.Fatalf("git should report a real version, got %+v", git)
	}
}

func TestStartRejectsUnknownAndUnsupported(t *testing.T) {
	svc := New(scriptRunner{})
	if _, err := svc.Start("s1", "rm-rf", ActionInstall); !errors.Is(err, ErrUnknownApp) {
		t.Fatalf("unknown app: %v", err)
	}
	if _, err := svc.Start("s1", "docker", ActionRemove); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("docker remove must stay unavailable: %v", err)
	}
	if _, err := svc.Start("s1", "git", Action("format")); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("unknown action: %v", err)
	}
}

func waitFor(t *testing.T, svc *Service, serverID, id string, state State) Job {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		j, err := svc.Get(serverID, id)
		if err != nil {
			t.Fatal(err)
		}
		if j.State == state {
			return j
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job never reached %s", state)
	return Job{}
}

func TestJobStreamsLogAndFinishes(t *testing.T) {
	// The runner answers the verification detect with the same canned lines.
	svc := New(scriptRunner{lines: []string{"downloading", "bun\t1.2.3"}})
	j, err := svc.Start("s1", "bun", ActionInstall)
	if err != nil {
		t.Fatal(err)
	}
	done := waitFor(t, svc, "s1", j.ID, StateDone)
	if !slices.Equal(done.Log, []string{"downloading", "bun\t1.2.3"}) {
		t.Fatalf("log: %v", done.Log)
	}
	if _, err := svc.Get("other-server", j.ID); !errors.Is(err, ErrJobNotFound) {
		t.Fatalf("a job must not leak across servers: %v", err)
	}
}

func TestJobFailureSurfacesTheScriptsOwnMessage(t *testing.T) {
	svc := New(scriptRunner{
		lines: []string{"root or passwordless sudo is required"},
		err:   errors.New("exit status 1"),
	})
	j, _ := svc.Start("s1", "git", ActionInstall)
	failed := waitFor(t, svc, "s1", j.ID, StateFailed)
	if failed.Error != "root or passwordless sudo is required" {
		t.Fatalf("error: %q", failed.Error)
	}
}

// A script that exits 0 without doing its job (an installer printing usage) must
// not be reported as done.
func TestExitZeroIsNotSuccessUntilTheAppIsReallyThere(t *testing.T) {
	install := New(scriptRunner{lines: []string{"Unknown flag -s"}})
	j, _ := install.Start("s1", "bun", ActionInstall)
	failed := waitFor(t, install, "s1", j.ID, StateFailed)
	if !strings.Contains(failed.Error, "not on the server") {
		t.Fatalf("error: %q", failed.Error)
	}

	remove := New(scriptRunner{lines: []string{"git\t2.39.2"}})
	j, _ = remove.Start("s1", "git", ActionRemove)
	failed = waitFor(t, remove, "s1", j.ID, StateFailed)
	if !strings.Contains(failed.Error, "still on the server") {
		t.Fatalf("error: %q", failed.Error)
	}
}

func TestOneRunningJobPerAppAndServer(t *testing.T) {
	gate := make(chan struct{})
	svc := New(scriptRunner{gate: gate, lines: []string{"bun\t1.2.3"}})
	first, err := svc.Start("s1", "bun", ActionInstall)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Start("s1", "bun", ActionUpdate); !errors.Is(err, ErrBusy) {
		t.Fatalf("second job on the same app: %v", err)
	}
	if _, err := svc.Start("s2", "bun", ActionInstall); err != nil {
		t.Fatalf("another server must not be blocked: %v", err)
	}
	close(gate)
	waitFor(t, svc, "s1", first.ID, StateDone)
}

// Nothing here runs a script: sh -n only parses it, so a typo in a catalogue
// script fails the build instead of failing on someone's server.
func TestEveryScriptParsesAsShell(t *testing.T) {
	scripts := map[string]string{"detect": detectScript()}
	for _, app := range Catalog {
		for _, action := range []Action{ActionInstall, ActionUpdate, ActionRemove} {
			if script := app.script(action); script != "" {
				scripts[app.ID+"/"+string(action)] = prelude + script
			}
		}
	}
	for name, script := range scripts {
		cmd := exec.Command("sh", "-n")
		cmd.Stdin = strings.NewReader(script)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Errorf("%s does not parse: %v\n%s", name, err, out)
		}
	}
}

func TestRemoteCommandRoundTripsTheScript(t *testing.T) {
	script := "echo \"it's $HOME\"\nprintf '%s\\n' 'a\tb'\n"
	out, err := exec.Command("sh", "-c", remoteCommand(script)).Output()
	if err != nil {
		t.Fatal(err)
	}
	want, _ := exec.Command("sh", "-c", script).Output()
	if string(out) != string(want) {
		t.Fatalf("got %q, want %q", out, want)
	}
}
