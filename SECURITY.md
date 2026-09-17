# Security Policy

## Supported versions

Security fixes are accepted against the default branch of this repository. There is no
separate long-term support release yet.

## Reporting a vulnerability

If you discover a security vulnerability in ServerUI, report it privately.

Do **not** open a public GitHub issue, pull request, or discussion until maintainers have
had a chance to address it.

Do **not** include:

- passwords
- private SSH keys
- API keys or tokens
- database credentials
- decrypted ServerUI secrets

### Contact

Email [contact@skyrekon.com](mailto:contact@skyrekon.com).

Use this address for security reports and any other project contact.

## Credential handling

Server passwords and private keys are encrypted with AES-256-GCM before they are stored
in PostgreSQL. The encryption key comes from `SERVERUI_CREDENTIAL_ENCRYPTION_KEY`.

Generate a 32-byte key as 64 hex characters:

```bash
openssl rand -hex 32
```

Copy `.env.example` to `.env` and set the value, or run `make setup-env`. Never commit
the real key.

Enable GitHub Secret Scanning on the public repository. Local Git hooks and CI also
reject committed `.env` and private-key files, but they are not a substitute for
responsible disclosure.
