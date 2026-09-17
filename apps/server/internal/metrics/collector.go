package metrics

import (
	"sync"
	"time"

	sshx "serverui/server/internal/ssh"
)

type cacheEntry struct {
	prev       cpuSample
	cached     Snapshot
	cachedAt   time.Time
	err        error
	refreshing bool
}

type Collector struct {
	pool *sshx.Pool

	mu       sync.Mutex
	byServer map[string]*cacheEntry
}

func NewCollector(pool *sshx.Pool) *Collector {
	return &Collector{
		pool:     pool,
		byServer: map[string]*cacheEntry{},
	}
}

func (c *Collector) entry(id string) *cacheEntry {
	if item, ok := c.byServer[id]; ok {
		return item
	}
	item := &cacheEntry{}
	c.byServer[id] = item
	return item
}

func (c *Collector) Cached(id string) (Snapshot, error, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	item := c.entry(id)
	if item.cachedAt.IsZero() {
		return Snapshot{}, item.err, false
	}
	return item.cached, item.err, true
}

func (c *Collector) Invalidate(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.byServer, id)
}

func (c *Collector) RefreshAsync(id string) {
	if id == "" {
		return
	}
	c.mu.Lock()
	item := c.entry(id)
	if item.refreshing {
		c.mu.Unlock()
		return
	}
	item.refreshing = true
	c.mu.Unlock()

	go func() {
		snap, err := c.collect(id)
		c.mu.Lock()
		item := c.entry(id)
		item.refreshing = false
		if err != nil {
			item.err = err
		} else {
			item.cached = snap
			item.cachedAt = time.Now()
			item.err = nil
		}
		c.mu.Unlock()
	}()
}

func (c *Collector) Snapshot(id string) (Snapshot, error) {
	c.mu.Lock()
	item := c.entry(id)
	if !item.cachedAt.IsZero() && time.Since(item.cachedAt) < 2*time.Second {
		snap := item.cached
		c.mu.Unlock()
		return snap, nil
	}
	c.mu.Unlock()
	return c.collect(id)
}

func (c *Collector) collect(id string) (Snapshot, error) {
	first, err := c.pool.Run(id, "cat /proc/stat")
	if err != nil {
		return Snapshot{}, err
	}
	time.Sleep(200 * time.Millisecond)
	second, err := c.pool.Run(id, "cat /proc/stat")
	if err != nil {
		return Snapshot{}, err
	}
	mem, err := c.pool.Run(id, "cat /proc/meminfo")
	if err != nil {
		return Snapshot{}, err
	}
	disk, err := c.pool.Run(id, "df -P /")
	if err != nil {
		return Snapshot{}, err
	}
	uptime, err := c.pool.Run(id, "cat /proc/uptime")
	if err != nil {
		return Snapshot{}, err
	}
	hostname, err := c.pool.Run(id, "cat /etc/hostname")
	if err != nil {
		hostname, _ = c.pool.Run(id, "hostname")
	}

	prev := ParseCPUStat(string(first))
	next := ParseCPUStat(string(second))

	c.mu.Lock()
	c.entry(id).prev = next
	c.mu.Unlock()

	return Snapshot{
		Hostname:      ParseHostname(string(hostname)),
		CPUUsage:      CPUPercent(prev, next),
		MemoryUsage:   ParseMemory(string(mem)),
		DiskUsage:     ParseDisk(string(disk)),
		UptimeSeconds: ParseUptime(string(uptime)),
	}, nil
}
