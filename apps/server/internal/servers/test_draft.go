package servers

import (
	"context"
	"log"
	"time"

	sshx "serverui/server/internal/ssh"
)

// CodeSavedCredentialUnavailable means the saved secret could not be decrypted.
const CodeSavedCredentialUnavailable = "saved_credential_unavailable"

type DraftTestResult struct {
	OK      bool   `json:"ok"`
	Latency int64  `json:"latencyMs"`
	Code    string `json:"code,omitempty"`
	Error   string `json:"error,omitempty"`
}

// TestDraft tests form details without saving; a blank secret reuses the saved one.
func (s *Service) TestDraft(ctx context.Context, serverID string, input Input) (DraftTestResult, error) {
	input = Normalize(input)
	var saved Record
	useSaved := false
	if serverID != "" {
		var err error
		if saved, err = s.store.Get(ctx, serverID); err != nil {
			return DraftTestResult{}, err
		}
		useSaved = input.Password == "" && input.PrivateKey == "" && input.AuthType == saved.AuthType
	}
	if err := ValidateConnection(input, !useSaved); err != nil {
		return DraftTestResult{}, err
	}

	var auth sshx.AuthMethod
	var err error
	if useSaved {
		if auth, err = s.savedAuth(ctx, saved); err != nil {
			return DraftTestResult{
				Code:  CodeSavedCredentialUnavailable,
				Error: "The saved credential could not be read. Enter the password or private key again.",
			}, nil
		}
	} else if auth, err = authMethod(input.AuthType, input.secretValue()); err != nil {
		return failedDraft(err, 0), nil
	}

	trustedID := ""
	if serverID != "" && input.Host == saved.Host && input.Port == saved.Port {
		trustedID = saved.ID
	}
	cfg := sshx.Config{Host: input.Host, Port: input.Port, Username: input.Username, HostKeyCallback: s.hostKeyCallback(trustedID, false)}
	log.Printf("server.test_draft host=%s port=%d saved_credential=%t", cfg.Host, cfg.Port, useSaved)
	start := time.Now()
	err = s.dial(cfg, auth)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return failedDraft(err, latency), nil
	}
	return DraftTestResult{OK: true, Latency: latency}, nil
}

func (in Input) secretValue() string {
	if in.AuthType == AuthPrivateKey {
		return in.PrivateKey
	}
	return in.Password
}

func failedDraft(err error, latency int64) DraftTestResult {
	code, message := sshx.ClassifyError(err)
	return DraftTestResult{OK: false, Latency: latency, Code: code, Error: message}
}
