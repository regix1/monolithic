package services

import (
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogWatchGlob is the filesystem glob used to discover log files to monitor.
// Matches the path the previous overlay/scripts/log-watcher.sh inspected.
const LogWatchGlob = "/data/logs/*.log"

// logWatcherState tracks per-file inode + size on the previous tick so the
// next tick can detect rotation (inode change) or truncation (size shrink).
type logWatcherState struct {
	mu     sync.Mutex
	inodes map[string]uint64
	sizes  map[string]int64
}

// newLogWatcherState builds a zeroed state container.
func newLogWatcherState() *logWatcherState {
	return &logWatcherState{
		inodes: map[string]uint64{},
		sizes:  map[string]int64{},
	}
}

// StartLogWatcher launches a goroutine that polls /data/logs/*.log every
// `interval` and runs `nginx -s reopen` on inode change, deletion, or
// truncation.
func StartLogWatcher(interval time.Duration) {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	state := newLogWatcherState()
	go func() {
		// Seed inode/size snapshot once before the first tick so we don't fire
		// a reopen on startup just because we've never seen these files.
		state.snapshot()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			if state.detectRotation() {
				if err := reopenNginxLogs(); err != nil {
					log.Printf("log-watcher: nginx -s reopen failed: %v", err)
				} else {
					log.Printf("log-watcher: nginx -s reopen issued (rotation/truncation detected)")
				}
				// Re-snapshot after the reopen so we measure against the new files.
				state.snapshot()
			}
		}
	}()
}

// snapshot records the current inode + size for every matched log file. Files
// missing from this snapshot but seen earlier are treated as deleted on the
// next detectRotation tick.
func (s *logWatcherState) snapshot() {
	matches, _ := filepath.Glob(LogWatchGlob)

	s.mu.Lock()
	defer s.mu.Unlock()

	s.inodes = map[string]uint64{}
	s.sizes = map[string]int64{}

	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if ino, ok := fileInode(info); ok {
			s.inodes[path] = ino
		}
		s.sizes[path] = info.Size()
	}
}

// detectRotation compares the current inodes/sizes against the last snapshot
// and updates the snapshot in place. Returns true if any file rotated, was
// truncated, or was deleted.
func (s *logWatcherState) detectRotation() bool {
	matches, _ := filepath.Glob(LogWatchGlob)
	currentInodes := map[string]uint64{}
	currentSizes := map[string]int64{}

	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if ino, ok := fileInode(info); ok {
			currentInodes[path] = ino
		}
		currentSizes[path] = info.Size()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rotated := false
	// Check inode changes + truncations on files we've seen before.
	for path, prevIno := range s.inodes {
		curIno, curOK := currentInodes[path]
		if !curOK {
			// File disappeared — almost always logrotate moved it.
			rotated = true
			continue
		}
		if curIno != prevIno {
			rotated = true
			continue
		}
		if prevSize, ok := s.sizes[path]; ok {
			if curSize, ok2 := currentSizes[path]; ok2 && curSize < prevSize {
				// Truncated in place (copytruncate-style rotation).
				rotated = true
			}
		}
	}

	// Update snapshot.
	s.inodes = currentInodes
	s.sizes = currentSizes
	return rotated
}

// reopenNginxLogs runs `nginx -s reopen` via the shared RunCommand helper.
// `nginx` reads its PID from the master process's pidfile.
func reopenNginxLogs() error {
	_, err := RunCommand("nginx", "-s", "reopen")
	return err
}
