package metrics

import (
	"strconv"
	"strings"
)

type Snapshot struct {
	Hostname      string
	CPUUsage      float64
	MemoryUsage   float64
	DiskUsage     float64
	UptimeSeconds int64
}

func ParseHostname(raw string) string {
	return strings.TrimSpace(raw)
}

func ParseUptime(raw string) int64 {
	field := strings.Fields(strings.TrimSpace(raw))
	if len(field) == 0 {
		return 0
	}
	seconds, err := strconv.ParseFloat(field[0], 64)
	if err != nil {
		return 0
	}
	return int64(seconds)
}

func ParseMemory(raw string) float64 {
	var total, available float64
	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		value, err := strconv.ParseFloat(fields[1], 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			total = value
		case "MemAvailable:":
			available = value
		}
	}
	if total <= 0 {
		return 0
	}
	used := total - available
	if used < 0 {
		used = 0
	}
	return round1((used / total) * 100)
}

func ParseDisk(raw string) float64 {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) < 2 {
		return 0
	}
	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 5 {
		return 0
	}
	percent := strings.TrimSuffix(fields[4], "%")
	value, err := strconv.ParseFloat(percent, 64)
	if err != nil {
		return 0
	}
	return round1(value)
}

type cpuSample struct {
	idle  uint64
	total uint64
}

func ParseCPUStat(raw string) cpuSample {
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)
		var total, idle uint64
		for i, field := range fields[1:] {
			n, _ := strconv.ParseUint(field, 10, 64)
			total += n
			if i == 3 || i == 4 {
				idle += n
			}
		}
		return cpuSample{idle: idle, total: total}
	}
	return cpuSample{}
}

func CPUPercent(prev, next cpuSample) float64 {
	if prev.total == 0 || next.total <= prev.total {
		return 0
	}
	totalDelta := float64(next.total - prev.total)
	idleDelta := float64(next.idle - prev.idle)
	used := totalDelta - idleDelta
	if used < 0 {
		used = 0
	}
	return round1((used / totalDelta) * 100)
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
