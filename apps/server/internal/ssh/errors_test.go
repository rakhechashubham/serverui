package sshx

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestClassify(t *testing.T) {
	cases := []struct {
		name      string
		err       error
		host      string
		port      int
		username  string
		wantCode  ErrorCode
		wantRetry bool
	}{
		{
			name:      "passphrase protected key",
			err:       errors.New("passphrase required"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeKeyPassphraseProtected,
			wantRetry: false,
		},
		{
			name:      "empty key",
			err:       errors.New("private key is required"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeKeyEmpty,
			wantRetry: false,
		},
		{
			name:      "invalid key format",
			err:       errors.New("invalid private key"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeKeyInvalidFormat,
			wantRetry: false,
		},
		{
			name:      "unsupported key type",
			err:       errors.New("unsupported key type: ssh-dss"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeKeyUnsupportedType,
			wantRetry: false,
		},
		{
			name:      "dns resolution failed",
			err:       errors.New("lookup nope.invalid: no such host"),
			host:      "nope.invalid",
			port:      22,
			username:  "user",
			wantCode:  CodeDNSResolutionFailed,
			wantRetry: true,
		},
		{
			name:      "connection refused",
			err:       errors.New("connection refused"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeSSHConnectionRefused,
			wantRetry: true,
		},
		{
			name:      "connection timeout",
			err:       errors.New("i/o timeout"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeConnectionTimeout,
			wantRetry: true,
		},
		{
			name:      "host unreachable",
			err:       errors.New("no route to host"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeHostUnreachable,
			wantRetry: true,
		},
		{
			name:      "connection reset",
			err:       errors.New("connection reset by peer"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeSSHConnectionReset,
			wantRetry: true,
		},
		{
			name:      "not ssh server",
			err:       errors.New("handshake failed: no common algorithm"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeNotSSHServer,
			wantRetry: false,
		},
		{
			name:      "auth failed - permission denied",
			err:       errors.New("permission denied"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeSSHAuthFailed,
			wantRetry: false,
		},
		{
			name:      "auth failed - no supported methods",
			err:       errors.New("unable to authenticate, no supported methods remain"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeAuthNoValidMethods,
			wantRetry: false,
		},
		{
			name:      "host key changed",
			err:       errors.New("host key changed"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeHostKeyChanged,
			wantRetry: false,
		},
		{
			name:      "unknown error",
			err:       errors.New("something unexpected"),
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  CodeInternalError,
			wantRetry: true,
		},
		{
			name:      "nil error",
			err:       nil,
			host:      "example.com",
			port:      22,
			username:  "user",
			wantCode:  "",
			wantRetry: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			se := Classify(tc.err, tc.host, tc.port, tc.username)
			if tc.err == nil {
				if se != nil {
					t.Errorf("expected nil for nil error, got %v", se)
				}
				return
			}
			if se == nil {
				t.Fatal("expected non-nil SSHError")
			}
			if se.Code != tc.wantCode {
				t.Errorf("code = %q, want %q", se.Code, tc.wantCode)
			}
			if se.Retryable != tc.wantRetry {
				t.Errorf("retryable = %v, want %v", se.Retryable, tc.wantRetry)
			}
			if se.Host != tc.host {
				t.Errorf("host = %q, want %q", se.Host, tc.host)
			}
			if se.Port != tc.port {
				t.Errorf("port = %d, want %d", se.Port, tc.port)
			}
			if se.Username != tc.username {
				t.Errorf("username = %q, want %q", se.Username, tc.username)
			}
			if se.Message == "" {
				t.Error("message should not be empty")
			}
			if se.Hint == "" {
				t.Error("hint should not be empty")
			}
			if se.DocsURL == "" {
				t.Error("docs_url should not be empty")
			}
		})
	}
}

func TestSSHError_JSON(t *testing.T) {
	se := ErrConnectionTimeout("example.com", 22, errors.New("i/o timeout"))
	data, err := se.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON failed: %v", err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	// Check fields present
	expectedFields := []string{"code", "message", "hint", "docs_url", "retryable", "host", "port"}
	for _, field := range expectedFields {
		if _, ok := parsed[field]; !ok {
			t.Errorf("missing field %s in JSON", field)
		}
	}
	// Check error field is not serialized (it's excluded)
	if _, ok := parsed["error"]; ok {
		t.Error("Err field should not be in JSON")
	}
}

func TestErrorConstructors(t *testing.T) {
	tests := []struct {
		name string
		err  *SSHError
	}{
		{"passphrase", ErrKeyPassphraseProtected(errors.New("test"))},
		{"invalid format", ErrKeyInvalidFormat(errors.New("test"), "PuTTY")},
		{"invalid pem", ErrKeyInvalidPEM(errors.New("test"))},
		{"unsupported type", ErrKeyUnsupportedType(errors.New("test"), "ssh-dss")},
		{"empty", ErrKeyEmpty()},
		{"dns", ErrDNSResolutionFailed("host", errors.New("test"))},
		{"timeout", ErrConnectionTimeout("host", 22, errors.New("test"))},
		{"refused", ErrConnectionRefused("host", 22, errors.New("test"))},
		{"unreachable", ErrHostUnreachable("host", errors.New("test"))},
		{"reset", ErrConnectionReset("host", 22, errors.New("test"))},
		{"not ssh", ErrNotSSHServer("host", 22, errors.New("test"))},
		{"auth failed", ErrAuthFailed("host", 22, "user", errors.New("test"))},
		{"no valid methods", ErrAuthNoValidMethods("host", 22, "user", errors.New("test"))},
		{"host key changed", ErrHostKeyChanged("host", 22, errors.New("test"))},
		{"host key verification", ErrHostKeyVerificationFailed("host", 22, errors.New("test"))},
		{"internal", ErrInternal(errors.New("test"))},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.err.Code == "" {
				t.Error("code should not be empty")
			}
			if tc.err.Message == "" {
				t.Error("message should not be empty")
			}
			if tc.err.Hint == "" {
				t.Error("hint should not be empty")
			}
			if tc.err.DocsURL == "" {
				t.Error("docs_url should not be empty")
			}
		})
	}
}

func TestIsRetryableError(t *testing.T) {
	retryable := []ErrorCode{
		CodeDNSResolutionFailed,
		CodeConnectionTimeout,
		CodeSSHConnectionRefused,
		CodeHostUnreachable,
		CodeSSHConnectionReset,
	}
	nonRetryable := []ErrorCode{
		CodeKeyPassphraseProtected,
		CodeKeyInvalidFormat,
		CodeKeyInvalidPEM,
		CodeKeyUnsupportedType,
		CodeKeyEmpty,
		CodeSSHAuthFailed,
		CodeAuthNoValidMethods,
		CodeAuthMethodUnsupported,
		CodeHostKeyChanged,
		CodeHostKeyVerification,
		CodeNotSSHServer,
	}

	for _, code := range retryable {
		err := Classify(errors.New("test"), "host", 22, "user")
		// Force the code
		err.Code = code
		if !IsRetryableError(err) {
			t.Errorf("%s should be retryable", code)
		}
	}
	for _, code := range nonRetryable {
		err := Classify(errors.New("test"), "host", 22, "user")
		err.Code = code
		if IsRetryableError(err) {
			t.Errorf("%s should not be retryable", code)
		}
	}
}

func TestIsAuthError(t *testing.T) {
	authCodes := []ErrorCode{
		CodeSSHAuthFailed,
		CodeAuthNoValidMethods,
		CodeAuthMethodUnsupported,
	}
	for _, code := range authCodes {
		err := Classify(errors.New("test"), "host", 22, "user")
		err.Code = code
		if !IsAuthError(err) {
			t.Errorf("%s should be auth error", code)
		}
	}
}

func TestIsKeyError(t *testing.T) {
	keyCodes := []ErrorCode{
		CodeKeyPassphraseProtected,
		CodeKeyInvalidFormat,
		CodeKeyInvalidPEM,
		CodeKeyUnsupportedType,
		CodeKeyEmpty,
	}
	for _, code := range keyCodes {
		err := Classify(errors.New("test"), "host", 22, "user")
		err.Code = code
		if !IsKeyError(err) {
			t.Errorf("%s should be key error", code)
		}
	}
}

func TestIsNetworkError(t *testing.T) {
	netCodes := []ErrorCode{
		CodeDNSResolutionFailed,
		CodeConnectionTimeout,
		CodeSSHConnectionRefused,
		CodeHostUnreachable,
		CodeSSHConnectionReset,
	}
	for _, code := range netCodes {
		err := Classify(errors.New("test"), "host", 22, "user")
		err.Code = code
		if !IsNetworkError(err) {
			t.Errorf("%s should be network error", code)
		}
	}
}

func TestToRichResponse(t *testing.T) {
	err := ErrConnectionTimeout("example.com", 22, errors.New("i/o timeout"))
	rich := ToRichResponse(err)
	if rich == nil {
		t.Fatal("expected non-nil RichErrorResponse")
	}
	if rich.Code != string(CodeConnectionTimeout) {
		t.Errorf("code = %q, want %q", rich.Code, CodeConnectionTimeout)
	}
	if rich.Message == "" {
		t.Error("message should not be empty")
	}
	if rich.Hint == "" {
		t.Error("hint should not be empty")
	}
	if rich.DocsURL == "" {
		t.Error("docs_url should not be empty")
	}
	if !rich.Retryable {
		t.Error("should be retryable")
	}
	if rich.Host != "example.com" {
		t.Errorf("host = %q, want example.com", rich.Host)
	}
	if rich.Port != 22 {
		t.Errorf("port = %d, want 22", rich.Port)
	}
}

func TestFormatErrorForLog(t *testing.T) {
	err := ErrAuthFailed("example.com", 22, "user", errors.New("permission denied"))
	logLine := FormatErrorForLog(err)
	if logLine == "" {
		t.Error("log line should not be empty")
	}
	expectedParts := []string{
		"code=SSH_AUTH_FAILED",
		"message=",
		"host=example.com",
		"port=22",
		"user=user",
		"retryable=false",
	}
	for _, part := range expectedParts {
		if !containsString(logLine, part) {
			t.Errorf("log line %q missing %q", logLine, part)
		}
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr)
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
