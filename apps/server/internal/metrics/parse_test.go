package metrics

import "testing"

func TestParseMemory(t *testing.T) {
	raw := "MemTotal:       8000000 kB\nMemAvailable:   2000000 kB\n"
	got := ParseMemory(raw)
	if got != 75 {
		t.Fatalf("got %v", got)
	}
}

func TestParseDisk(t *testing.T) {
	raw := "Filesystem     1024-blocks    Used Available Capacity Mounted on\n/dev/sda1         1000000  412000    588000      41% /\n"
	got := ParseDisk(raw)
	if got != 41 {
		t.Fatalf("got %v", got)
	}
}

func TestParseUptime(t *testing.T) {
	if ParseUptime("1245600.12 884000.04\n") != 1245600 {
		t.Fatal("uptime parse failed")
	}
}

func TestCPUPercent(t *testing.T) {
	prev := cpuSample{idle: 100, total: 200}
	next := cpuSample{idle: 130, total: 300}
	got := CPUPercent(prev, next)
	if got != 70 {
		t.Fatalf("got %v", got)
	}
}
