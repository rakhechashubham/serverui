package sshx

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Host     string
	Port     int
	Username string
	Password string
}

func LoadConfig() Config {
	return Config{
		Host:     envOr("SERVER_HOST", "203.0.113.10"),
		Port:     envInt("SERVER_PORT", 22),
		Username: envOr("SERVER_USER", "deploy"),
		Password: os.Getenv("SERVER_PASSWORD"),
	}
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
