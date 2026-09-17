package filesystem

import "testing"

func TestMIME(t *testing.T) {
	if MIME("photo.PNG") != "image/png" {
		t.Fatal("png")
	}
	if MIME("clip.mp4") != "video/mp4" {
		t.Fatal("mp4")
	}
	if MIME("notes.pdf") != "application/pdf" {
		t.Fatal("pdf")
	}
	if MIME("blob.bin") != "application/octet-stream" {
		t.Fatal("bin")
	}
	if MIME("hostname") != "text/plain" {
		t.Fatal("hostname")
	}
	if MIME("app.conf") != "text/plain" {
		t.Fatal("conf")
	}
}

func TestLooksLikeText(t *testing.T) {
	if !LooksLikeText([]byte("ubuntu\n")) {
		t.Fatal("hostname-like text")
	}
	if LooksLikeText([]byte{0x7f, 0x45, 0x4c, 0x46, 0, 1, 2}) {
		t.Fatal("elf should be binary")
	}
}

func TestDetectMIME(t *testing.T) {
	if DetectMIME("README", []byte("# hello\n")) != "text/plain" {
		t.Fatal("extensionless text")
	}
	if DetectMIME("blob.bin", []byte{0, 1, 2, 3}) != "application/octet-stream" {
		t.Fatal("binary stays octet-stream")
	}
}

func TestInline(t *testing.T) {
	if !Inline("image/jpeg") || !Inline("video/mp4") || !Inline("application/pdf") {
		t.Fatal("expected inline preview types")
	}
	if Inline("application/zip") || Inline("application/octet-stream") {
		t.Fatal("archives should download")
	}
}
