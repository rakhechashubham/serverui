// Package appstore detects, installs, updates and removes a closed list of
// tools on a server over SSH. Every script is a constant in this file: the
// client only ever names an app id and an action.
package appstore

import (
	"encoding/base64"
	"fmt"
)

type Action string

const (
	ActionInstall Action = "install"
	ActionUpdate  Action = "update"
	ActionRemove  Action = "remove"
)

// App is one catalogue entry. An empty script means the action is not offered.
type App struct {
	ID string
	// Bin is looked up on PATH to decide whether the app is installed.
	Bin string
	// Version is a pipeline that prints the installed version on one line.
	Version string
	Install string
	Update  string
	Remove  string
}

func (a App) script(action Action) string {
	switch action {
	case ActionInstall:
		return a.Install
	case ActionUpdate:
		return a.Update
	case ActionRemove:
		return a.Remove
	}
	return ""
}

// prelude merges stderr into the streamed stdout and makes user-level installs
// (~/.local/bin, ~/.bun/bin) visible to non-login SSH sessions.
const prelude = `exec 2>&1
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
`

// needRoot sets $SUDO, or stops with a clear message when neither root nor
// passwordless sudo is available.
const needRoot = `if [ "$(id -u)" = 0 ]; then SUDO=""
elif sudo -n true 2>/dev/null; then SUDO="sudo -n"
else echo "root or passwordless sudo is required"; exit 1; fi
`

// fetchAndRun downloads an installer to a temp file first, so a failed download
// stops the script instead of being hidden behind a pipe.
func fetchAndRun(url, interpreter, args string) string {
	return fmt.Sprintf("t=$(mktemp)\ncurl -fsSL %s -o \"$t\"\n%s \"$t\" %s\nrm -f \"$t\"\n", url, interpreter, args)
}

// distroPkg runs op ("install", "update" or "remove") for one package with
// whichever package manager the server has.
func distroPkg(op, pkg string) string {
	cmds := map[string][3]string{
		"install": {
			"$SUDO apt-get update -qq\n  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y " + pkg,
			"$SUDO dnf install -y " + pkg,
			"$SUDO apk add " + pkg,
		},
		"update": {
			"$SUDO apt-get update -qq\n  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade " + pkg,
			"$SUDO dnf upgrade -y " + pkg,
			"$SUDO apk add -u " + pkg,
		},
		"remove": {
			"$SUDO env DEBIAN_FRONTEND=noninteractive apt-get remove -y " + pkg,
			"$SUDO dnf remove -y " + pkg,
			"$SUDO apk del " + pkg,
		},
	}[op]
	return needRoot + fmt.Sprintf(`if command -v apt-get >/dev/null 2>&1; then
  %s
elif command -v dnf >/dev/null 2>&1; then
  %s
elif command -v apk >/dev/null 2>&1; then
  %s
else echo "no supported package manager (apt, dnf or apk)"; exit 1; fi
`, cmds[0], cmds[1], cmds[2])
}

var codeServerInstall = fetchAndRun("https://code-server.dev/install.sh", "sh", "--method standalone")

// Catalog is intentionally closed. Docker and Node.js are detect-only: removing
// them remotely can take containers or other tools down with it.
var Catalog = []App{
	{
		ID:      "code-server",
		Bin:     "code-server",
		Version: `code-server --version | awk '{print $1}'`,
		Install: codeServerInstall,
		Update:  codeServerInstall,
		// Stops the process ServerUI started (the pid is only trusted if it still is
		// code-server), then deletes the binary. Keeps ~/.config/code-server on purpose.
		Remove: `P="$HOME/.local/share/serverui/code-server.pid"
if [ -f "$P" ] && grep -q code-server "/proc/$(cat "$P")/cmdline" 2>/dev/null; then kill "$(cat "$P")" 2>/dev/null; fi
rm -f "$HOME"/.local/share/serverui/code-server.*
rm -rf "$HOME"/.local/lib/code-server-* "$HOME/.local/bin/code-server"
`,
	},
	{
		ID:      "claude-code",
		Bin:     "claude",
		Version: `claude --version | awk '{print $1}'`,
		Install: fetchAndRun("https://claude.ai/install.sh", "bash", ""),
		Update:  "claude update\n",
		// Keeps ~/.claude (settings, history) on purpose.
		Remove: `rm -f "$HOME/.local/bin/claude"; rm -rf "$HOME/.local/share/claude"` + "\n",
	},
	{
		ID:      "docker",
		Bin:     "docker",
		Version: `docker --version | awk '{print $3}' | tr -d ,`,
	},
	{
		ID:      "nodejs",
		Bin:     "node",
		Version: `node --version | tr -d v`,
	},
	{
		ID:      "bun",
		Bin:     "bun",
		Version: `bun --version`,
		Install: fetchAndRun("https://bun.sh/install", "bash", ""),
		Update:  "bun upgrade\n",
		Remove:  `rm -rf "$HOME/.bun"` + "\n",
	},
	{
		ID:      "git",
		Bin:     "git",
		Version: `git --version | awk '{print $3}'`,
		Install: distroPkg("install", "git"),
		Update:  distroPkg("update", "git"),
		Remove:  distroPkg("remove", "git"),
	},
}

func find(id string) (App, bool) {
	for _, app := range Catalog {
		if app.ID == id {
			return app, true
		}
	}
	return App{}, false
}

// detectScript prints one "id<TAB>version" line per installed app.
func detectScript() string {
	script := prelude
	for _, app := range Catalog {
		script += fmt.Sprintf(
			"if command -v %s >/dev/null 2>&1; then v=$(%s 2>/dev/null | head -1); printf '%s\\t%%s\\n' \"${v:-installed}\"; fi\n",
			app.Bin, app.Version, app.ID,
		)
	}
	return script
}

// remoteCommand ships a script as base64 so it survives any login shell's
// quoting. It runs as an argument of sh -c, not on stdin, so an installer
// cannot swallow the rest of the script.
func remoteCommand(script string) string {
	return `sh -c "$(printf %s ` + base64.StdEncoding.EncodeToString([]byte(script)) + ` | base64 -d)"`
}
