package servers

import "time"

const (
	AuthPassword   = "password"
	AuthPrivateKey = "private_key"

	StatusOnline               = "online"
	StatusOffline              = "offline"
	StatusConnecting           = "connecting"
	StatusAuthenticationFailed = "authentication_failed"
	StatusUnknown              = "unknown"
)

type Record struct {
	ID                 string
	Name               string
	GroupName          string
	Host               string
	Port               int
	Username           string
	AuthType           string
	HostKeyFingerprint string
	Status             string
	LastError          string
	LastSeen           *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type Credential struct {
	ID              string
	ServerID        string
	AuthType        string
	EncryptedSecret string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Input struct {
	Name               string
	GroupName          string
	Host               string
	Port               int
	Username           string
	AuthType           string
	Password           string
	PrivateKey         string
	HostKeyFingerprint string
}

type Public struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	GroupName          string     `json:"groupName,omitempty"`
	Host               string     `json:"host"`
	Port               int        `json:"port"`
	Username           string     `json:"username"`
	AuthType           string     `json:"authType"`
	HostKeyFingerprint string     `json:"hostKeyFingerprint,omitempty"`
	Status             string     `json:"status"`
	Error              string     `json:"error,omitempty"`
	LastSeen           *time.Time `json:"lastSeen,omitempty"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

func (r Record) Public() Public {
	return Public{
		ID:                 r.ID,
		Name:               r.Name,
		GroupName:          r.GroupName,
		Host:               r.Host,
		Port:               r.Port,
		Username:           r.Username,
		AuthType:           r.AuthType,
		HostKeyFingerprint: r.HostKeyFingerprint,
		Status:             r.Status,
		Error:              r.LastError,
		LastSeen:           r.LastSeen,
		CreatedAt:          r.CreatedAt,
		UpdatedAt:          r.UpdatedAt,
	}
}
