package servers

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"unicode"
)

func Validate(input Input, requireSecret bool) error {
	if strings.TrimSpace(input.Name) == "" {
		return fmt.Errorf("server name is required")
	}
	if err := validateHost(input.Host); err != nil {
		return err
	}
	if input.Port < 1 || input.Port > 65535 {
		return fmt.Errorf("invalid port")
	}
	if strings.TrimSpace(input.Username) == "" {
		return fmt.Errorf("username is required")
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
	if _, err := strconv.Atoi(host); err == nil {
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
	return input
}
