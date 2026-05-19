//go:build !windows

package services

import (
	"os"
	"syscall"
)

// fileInode extracts the inode from a FileInfo on Unix-like systems (Linux,
// Darwin, etc.). Returns (0, false) if the stat layout is unavailable.
func fileInode(info os.FileInfo) (uint64, bool) {
	sys := info.Sys()
	if sys == nil {
		return 0, false
	}
	stat, ok := sys.(*syscall.Stat_t)
	if !ok {
		return 0, false
	}
	return uint64(stat.Ino), true
}
