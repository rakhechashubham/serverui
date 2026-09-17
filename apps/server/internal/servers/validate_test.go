package servers

import "testing"

func TestValidateRejectsInvalid(t *testing.T) {
	valid := Input{
		Name:     "Production",
		Host:     "203.0.113.10",
		Port:     22,
		Username: "deploy",
		AuthType: AuthPassword,
		Password: "secret",
	}
	if err := Validate(valid, true); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		mut    func(*Input)
		want   string
		secret bool
	}{
		{"host", func(in *Input) { in.Host = "" }, "invalid host", true},
		{"port", func(in *Input) { in.Port = 0 }, "invalid port", true},
		{"username", func(in *Input) { in.Username = "" }, "username is required", true},
		{"auth", func(in *Input) { in.AuthType = "token" }, "invalid authentication type", true},
		{"password", func(in *Input) { in.Password = "" }, "password is required", true},
		{"key", func(in *Input) { in.AuthType = AuthPrivateKey; in.PrivateKey = "" }, "private key is required", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := valid
			tc.mut(&in)
			err := Validate(in, tc.secret)
			if err == nil || err.Error() != tc.want {
				t.Fatalf("got %v want %s", err, tc.want)
			}
		})
	}
}

func TestValidateAllowsMissingSecretWhenNotRequired(t *testing.T) {
	in := Input{
		Name:     "Production",
		Host:     "example.com",
		Port:     22,
		Username: "ubuntu",
		AuthType: AuthPassword,
	}
	if err := Validate(in, false); err != nil {
		t.Fatal(err)
	}
}
