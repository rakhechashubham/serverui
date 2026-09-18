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

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add private key authentication
fix: prevent filesystem path traversal
test: add SSH configuration tests
docs: improve local setup guide
refactor: isolate SSH connections by server id
chore: ignore local credential files
ci: cache npm and Go modules
```

Keep the subject under ~72 characters. Do not put secrets in commit messages.

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
