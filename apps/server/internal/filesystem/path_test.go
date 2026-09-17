package filesystem

import "testing"

func TestCleanPath(t *testing.T) {
	cases := map[string]string{
		"":                            "/",
		"/":                           "/",
		"/etc":                        "/etc",
		"/etc/":                       "/etc",
		"/etc/passwd":                 "/etc/passwd",
		"/tmp/../etc":                 "/etc",
		"/./home":                     "/home",
		"/var/www/../../etc/hostname": "/etc/hostname",
	}
	for in, want := range cases {
		got, err := CleanPath(in)
		if err != nil {
			t.Fatalf("%q: %v", in, err)
		}
		if got != want {
			t.Fatalf("%q: got %q want %q", in, got, want)
		}
	}
}

func TestJoinRejectsTraversalName(t *testing.T) {
	if _, err := Join("/tmp", ".."); err == nil {
		t.Fatal("expected error")
	}
	if _, err := Join("/tmp", "a/b"); err == nil {
		t.Fatal("expected error for slash in name")
	}
	got, err := Join("/", "etc")
	if err != nil || got != "/etc" {
		t.Fatalf("got %q %v", got, err)
	}
}
