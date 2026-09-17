# ServerUI Server

Go control-plane for ServerUI.

## Stack

Go, PostgreSQL, `golang.org/x/crypto/ssh`, SFTP, and WebSockets.

## Commands

```bash
go test ./...
go vet ./...
gofmt -l .
go build -o ../../bin/serverui-server ./cmd/server
```

The process reads `SERVERUI_CREDENTIAL_ENCRYPTION_KEY` and PostgreSQL settings, then
serves HTTP on `HTTP_PORT` (default `8080`).

It stores server configurations, encrypts credentials, and opens SSH to each configured
host. There is no ServerUI agent in this version.

Contact: [contact@skyrekon.com](mailto:contact@skyrekon.com)
