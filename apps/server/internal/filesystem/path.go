package filesystem

import (
	"fmt"
	"path"
	"strings"
)

func CleanPath(raw string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = "/"
	}
	if strings.ContainsRune(raw, 0) {
		return "", fmt.Errorf("invalid path")
	}
	cleaned := path.Clean("/" + strings.TrimPrefix(raw, "/"))
	if cleaned != "/" && strings.HasSuffix(raw, "/") {
		// Keep directories as cleaned absolute paths without a trailing slash,
		// except for root.
	}
	if !path.IsAbs(cleaned) {
		return "", fmt.Errorf("invalid path")
	}
	return cleaned, nil
}

func Join(base, name string) (string, error) {
	parent, err := CleanPath(base)
	if err != nil {
		return "", err
	}
	if name == "" || strings.Contains(name, "/") || name == "." || name == ".." {
		return "", fmt.Errorf("invalid name")
	}
	if parent == "/" {
		return CleanPath("/" + name)
	}
	return CleanPath(parent + "/" + name)
}
