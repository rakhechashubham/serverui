package crypto

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	key, err := RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := New(key)
	if err != nil {
		t.Fatal(err)
	}
	secret := "super-secret-value"
	ct, err := box.Encrypt(secret)
	if err != nil {
		t.Fatal(err)
	}
	if ct == secret {
		t.Fatal("ciphertext should not equal plaintext")
	}
	got, err := box.Decrypt(ct)
	if err != nil {
		t.Fatal(err)
	}
	if got != secret {
		t.Fatalf("got %q", got)
	}
}

func TestWrongKeyFails(t *testing.T) {
	a, err := RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	b, err := RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	boxA, err := New(a)
	if err != nil {
		t.Fatal(err)
	}
	boxB, err := New(b)
	if err != nil {
		t.Fatal(err)
	}
	ct, err := boxA.Encrypt("secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := boxB.Decrypt(ct); err == nil {
		t.Fatal("expected decrypt failure")
	}
}

func TestTamperedCiphertextFails(t *testing.T) {
	key, err := RandomKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := New(key)
	if err != nil {
		t.Fatal(err)
	}
	ct, err := box.Encrypt("secret")
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte(ct)
	raw[len(raw)-1] ^= 1
	if _, err := box.Decrypt(string(raw)); err == nil {
		t.Fatal("expected tamper failure")
	}
}

func TestParseKeyRejectsEmpty(t *testing.T) {
	if _, err := New(""); err == nil {
		t.Fatal("expected invalid key")
	}
}
