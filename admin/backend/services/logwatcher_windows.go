//go:build windows

package services

import "os"

// fileInode is a no-op on Windows: NTFS file identifiers exist but require
// the win32 API rather than syscall. The admin backend ships in a Linux
// container; this stub only exists so the package builds on a Windows dev
// machine. On Windows we fall back to size-only rotation detection.
func fileInode(info os.FileInfo) (uint64, bool) {
	_ = info
	return 0, false
}
