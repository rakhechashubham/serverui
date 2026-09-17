package filesystem

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/pkg/sftp"
	sshx "serverui/server/internal/ssh"
)

const maxReadBytes = 512 << 10

type Preview struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	Size      int64  `json:"size"`
	Truncated bool   `json:"truncated"`
	Mime      string `json:"mime"`
	Binary    bool   `json:"binary"`
}

type Entry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Type    string `json:"type"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"modified"`
	Mime    string `json:"mime,omitempty"`
}

type Service struct {
	pool *sshx.Pool
}

func New(pool *sshx.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) client(serverID string) (*sftp.Client, error) {
	if strings.TrimSpace(serverID) == "" {
		return nil, fmt.Errorf("server id is required")
	}
	conn, err := s.pool.Ensure(serverID)
	if err != nil {
		return nil, err
	}
	return sftp.NewClient(conn)
}

func (s *Service) List(serverID, rawPath string) ([]Entry, error) {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return nil, err
	}
	client, err := s.client(serverID)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	infos, err := client.ReadDir(cleaned)
	if err != nil {
		return nil, mapFSError(err)
	}
	entries := make([]Entry, 0, len(infos))
	for _, info := range infos {
		name := info.Name()
		entryPath := cleaned
		if cleaned == "/" {
			entryPath = "/" + name
		} else {
			entryPath = cleaned + "/" + name
		}
		kind := "file"
		mime := ""
		if info.IsDir() {
			kind = "dir"
		} else {
			mime = MIME(name)
		}
		entries = append(entries, Entry{
			Name:    name,
			Path:    entryPath,
			Type:    kind,
			Size:    info.Size(),
			Mode:    info.Mode().String(),
			ModTime: info.ModTime().UTC().Format(time.RFC3339),
			Mime:    mime,
		})
	}
	return entries, nil
}

func (s *Service) Read(serverID, rawPath string) (string, error) {
	preview, err := s.Preview(serverID, rawPath)
	if err != nil {
		return "", err
	}
	return preview.Content, nil
}

func (s *Service) Preview(serverID, rawPath string) (Preview, error) {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return Preview{}, err
	}
	client, err := s.client(serverID)
	if err != nil {
		return Preview{}, err
	}
	defer client.Close()

	info, err := client.Stat(cleaned)
	if err != nil {
		return Preview{}, mapFSError(err)
	}
	if info.IsDir() {
		return Preview{}, fmt.Errorf("not a file")
	}
	file, err := client.Open(cleaned)
	if err != nil {
		return Preview{}, mapFSError(err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxReadBytes+1))
	if err != nil {
		return Preview{}, err
	}
	truncated := int64(len(data)) > maxReadBytes
	if truncated {
		data = data[:maxReadBytes]
	}
	mime := DetectMIME(info.Name(), data)
	binary := !LooksLikeText(data)
	content := ""
	if !binary {
		content = string(data)
	}
	return Preview{
		Path:      cleaned,
		Content:   content,
		Size:      info.Size(),
		Truncated: truncated,
		Mime:      mime,
		Binary:    binary,
	}, nil
}

func (s *Service) Write(serverID, rawPath string, content []byte) error {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return err
	}
	if cleaned == "/" {
		return fmt.Errorf("not a file")
	}
	if len(content) > 32<<20 {
		return fmt.Errorf("file too large")
	}
	client, err := s.client(serverID)
	if err != nil {
		return err
	}
	defer client.Close()

	file, err := client.OpenFile(cleaned, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	if err != nil {
		return mapFSError(err)
	}
	defer file.Close()
	_, err = file.Write(content)
	return err
}

func (s *Service) Create(serverID, rawPath string) error {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return err
	}
	if cleaned == "/" {
		return fmt.Errorf("not a file")
	}
	client, err := s.client(serverID)
	if err != nil {
		return err
	}
	defer client.Close()
	file, err := client.OpenFile(cleaned, os.O_WRONLY|os.O_CREATE|os.O_EXCL)
	if err != nil {
		return mapFSError(err)
	}
	return file.Close()
}

func (s *Service) Mkdir(serverID, rawPath string) error {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return err
	}
	client, err := s.client(serverID)
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.Mkdir(cleaned); err != nil {
		return mapFSError(err)
	}
	return nil
}

func (s *Service) Rename(serverID, fromRaw, toRaw string) error {
	from, err := CleanPath(fromRaw)
	if err != nil {
		return err
	}
	to, err := CleanPath(toRaw)
	if err != nil {
		return err
	}
	if from == "/" || to == "/" {
		return fmt.Errorf("invalid path")
	}
	client, err := s.client(serverID)
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.Rename(from, to); err != nil {
		return mapFSError(err)
	}
	return nil
}

func (s *Service) Delete(serverID, rawPath string) error {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return err
	}
	if cleaned == "/" {
		return fmt.Errorf("refusing to delete root")
	}
	client, err := s.client(serverID)
	if err != nil {
		return err
	}
	defer client.Close()
	info, err := client.Stat(cleaned)
	if err != nil {
		return mapFSError(err)
	}
	if info.IsDir() {
		if err := client.RemoveDirectory(cleaned); err != nil {
			return mapFSError(err)
		}
		return nil
	}
	if err := client.Remove(cleaned); err != nil {
		return mapFSError(err)
	}
	return nil
}

func (s *Service) Download(serverID, rawPath string) (*sftp.File, os.FileInfo, *sftp.Client, error) {
	cleaned, err := CleanPath(rawPath)
	if err != nil {
		return nil, nil, nil, err
	}
	client, err := s.client(serverID)
	if err != nil {
		return nil, nil, nil, err
	}
	info, err := client.Stat(cleaned)
	if err != nil {
		_ = client.Close()
		return nil, nil, nil, mapFSError(err)
	}
	if info.IsDir() {
		_ = client.Close()
		return nil, nil, nil, fmt.Errorf("not a file")
	}
	file, err := client.Open(cleaned)
	if err != nil {
		_ = client.Close()
		return nil, nil, nil, mapFSError(err)
	}
	return file, info, client, nil
}

func mapFSError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, os.ErrNotExist) || os.IsNotExist(err) {
		return fmt.Errorf("file not found")
	}
	if os.IsPermission(err) {
		return fmt.Errorf("permission denied")
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "not exist"), strings.Contains(msg, "no such file"):
		return fmt.Errorf("file not found")
	case strings.Contains(msg, "permission denied"):
		return fmt.Errorf("permission denied")
	default:
		return fmt.Errorf("filesystem operation failed")
	}
}
