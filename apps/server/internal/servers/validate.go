package servers

import (
	"encoding/base64"
	"fmt"
	"net"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Limits shared with the web form (apps/web/src/lib/server-validation.ts).
const (
	maxNameLength     = 64
	maxUsernameLength = 64
)

func Validate(input Input, requireSecret bool) error {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return fmt.Errorf("server name is required")
	}
	if utf8.RuneCountInString(name) > maxNameLength {
		return fmt.Errorf("server name is too long")
	}
	if utf8.RuneCountInString(strings.TrimSpace(input.GroupName)) > 48 {
		return fmt.Errorf("server group name is too long")
	}
	return ValidateConnection(input, requireSecret)
}

// ValidateConnection is Validate without the name check, for testing unsaved details.
func ValidateConnection(input Input, requireSecret bool) error {
	if err := validateHost(input.Host); err != nil {
		return err
	}
	if input.Port < 1 || input.Port > 65535 {
		return fmt.Errorf("invalid port")
	}
	if input.HostKeyFingerprint != "" {
		encoded := strings.TrimPrefix(input.HostKeyFingerprint, "SHA256:")
		decoded, err := base64.RawStdEncoding.DecodeString(encoded)
		if !strings.HasPrefix(input.HostKeyFingerprint, "SHA256:") || err != nil || len(decoded) != 32 {
			return fmt.Errorf("invalid SSH host key fingerprint")
		}
	}
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if len(username) > maxUsernameLength || strings.ContainsAny(username, " \t\n:@/") {
		return fmt.Errorf("invalid username")
	}
	switch input.AuthType {
	case AuthPassword:
		if requireSecret && strings.TrimSpace(input.Password) == "" {
			return fmt.Errorf("password is required")
		}
	case AuthPrivateKey:
		if requireSecret && strings.TrimSpace(input.PrivateKey) == "" {
			return fmt.Errorf("private key is required")
		}
	default:
		return fmt.Errorf("invalid authentication type")
	}
	return nil
}

func validateHost(host string) error {
	host = strings.TrimSpace(host)
	if host == "" {
		return fmt.Errorf("invalid host")
	}
	if strings.ContainsAny(host, " \t\n/") {
		return fmt.Errorf("invalid host")
	}
	if ip := net.ParseIP(host); ip != nil {
		return nil
	}
	// Digits and dots only, but not a valid IP (e.g. 203.0.113.300).
	if strings.Trim(host, "0123456789.") == "" {
		return fmt.Errorf("invalid host")
	}
	for _, r := range host {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' {
			continue
		}
		return fmt.Errorf("invalid host")
	}
	return nil
}

func Normalize(input Input) Input {
	input.Name = strings.TrimSpace(input.Name)
	input.GroupName = strings.TrimSpace(input.GroupName)
	input.Host = strings.TrimSpace(input.Host)
	input.Username = strings.TrimSpace(input.Username)
	input.AuthType = strings.TrimSpace(input.AuthType)
	if input.AuthType == "key" {
		input.AuthType = AuthPrivateKey
	}
	if input.Port == 0 {
		input.Port = 22
	}
	input.Password = strings.TrimSpace(input.Password)
	input.PrivateKey = strings.TrimSpace(input.PrivateKey)
	input.HostKeyFingerprint = strings.TrimSpace(input.HostKeyFingerprint)
	return input
}
