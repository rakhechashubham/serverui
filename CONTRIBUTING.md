# Contributing to ServerUI

Thank you for helping build ServerUI. This guide is for people who have never seen
the repository before.

## Before you start

- Read the [README](README.md) for architecture, setup, and current limitations.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report vulnerabilities privately to [contact@skyrekon.com](mailto:contact@skyrekon.com).
  See [SECURITY.md](SECURITY.md). Do not file public issues that include secrets.
- For other questions, use the same address: [contact@skyrekon.com](mailto:contact@skyrekon.com).

CLI and the ServerUI agent are **not implemented**. Do not add them in an unrelated PR.

## Development setup

Prerequisites: Git, Docker, Docker Compose, Node.js 22+, Go 1.26, OpenSSL, Make,
and lazydocker (for `make dev`).

```bash
git clone <repository-url>
cd serverui
cp .env.example .env
make setup-env
make hooks
make dev
```

`make dev` starts the development stack and opens LazyDocker. Exiting that session
removes the containers and keeps the database volume.

`make start` builds production images and leaves the stack running in the background.

`make hooks` sets `core.hooksPath` to `.githooks`. Local commits then run
`make format-check`, `make lint`, and `make test`. Hooks are a developer safeguard, not
a replacement for CI. They can be bypassed; GitHub Actions still must pass.

## Repository structure

```
apps/web      Next.js UI (shared by web + desktop)
apps/server   Go API, SSH, PostgreSQL
apps/desktop  Tauri desktop shell
deploy/docker Docker Compose (web deployment; not required by the Go binary)
docs/         Architecture and images
```

Desktop uses Tauri around the existing UI and Go backend. Do not move SSH into
the frontend or create a second backend. See [docs/desktop.md](docs/desktop.md).

## Workflow

1. Fork the repository (or create a branch if you have write access).
2. Create a branch from `main`.
3. Make a focused change.
4. Run `make format`, `make format-check`, `make lint`, `make test`, and `make build`.
5. Commit with a conventional message.
6. Push and open a pull request.

### Branch naming

```
feature/server-management
fix/ssh-connection
docs/contributing
refactor/connection-manager
test/filesystem-paths
```

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/). The `commit-msg` hook enforces this format.

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types (required):**
| Type | Purpose |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Code style (formatting, missing semicolons, etc.) |
| `refactor` | Code changes that neither fix bugs nor add features |
| `test` | Adding or updating tests |
| `chore` | Maintenance (deps, build, config, tooling) |
| `perf` | Performance improvements |
| `ci` | CI/CD changes |
| `build` | Build system or external dependencies |
| `revert` | Reverts a previous commit |

**Scope (optional but encouraged):**
Use a short, lowercase identifier for the area affected.
Common scopes in ServerUI: `files`, `ssh`, `ui`, `server`, `desktop`, `docker`, `ci`, `deps`, `config`, `auth`, `db`, `api`.

**Description (required):**
- Present tense ("add" not "added")
- Lowercase first letter
- No period at the end
- Under ~72 characters

**Examples:**
```
feat(files): add archive extraction support
fix(ssh): prevent connection timeout on slow networks
docs: improve local setup guide
refactor(server): isolate SSH connections by server ID
test(ui): add file tree component tests
chore(deps): update Go dependencies
perf(api): reduce connection pool overhead
ci: add PR title validation workflow
revert: feat(files): add archive extraction support
```

**Breaking changes:**
Add `BREAKING CHANGE:` in the footer (or `!` after type/scope):
```
feat(api)!: change authentication response format

BREAKING CHANGE: auth response now includes user object instead of just token
```

**Commit message validation:**
- Local: `make hooks` installs the `commit-msg` hook (runs on every commit)
- CI: PR title validated by GitHub Actions (`.github/workflows/pr-title.yml`)
- Both enforce the same rules

**Tips:**
- Use `git commit -m "feat(files): add archive extraction"` for single-line
- Use `git commit` (no `-m`) for multi-line with body/footer
- `git commit --amend` to fix the last commit message
- `git rebase -i HEAD~3` to reword/squash recent commits before pushing

## Code style

- **Go:** `gofmt`. Exported API stays small. SSH, crypto, database, and HTTP stay in
  separate packages. Never log passwords, keys, or decrypted secrets.
- **TypeScript/React:** Prettier for formatting, ESLint for quality. Prefer existing
  components over new UI systems. Do not redesign the desktop unless the change requires it.
- **Naming:** `camelCase` in TypeScript, `MixedCaps` in Go. Server identifiers are
  backend-owned IDs, not hostnames supplied by the browser.
- **Errors:** Return machine-readable, non-sensitive messages to the UI. Map SSH failures
  through `PublicError`.
- **Tests:** Cover behavior, not line count. Add or update tests for the code you change.

## Pull requests

Use the PR template. Explain what changed, why, how it was tested, and any breaking
changes.

Checklist:

- [ ] `make test`
- [ ] `make lint`
- [ ] `make format-check`
- [ ] `make build`
- [ ] Docs updated when behavior or commands change
- [ ] No secrets committed

## Privacy

Never commit real names, usernames, IP addresses, hostnames, domains, passwords, or
keys. Examples must use fictional values such as `203.0.113.10` and `deploy`.
