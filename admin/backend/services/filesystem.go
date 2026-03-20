package services

import (
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

var FsRecommendations = map[string]models.FsRecommendation{
	"bcachefs":  {Sendfile: "on"},
	"btrfs":     {Sendfile: "off", Warning: "Btrfs copy-on-write — sendfile may cause data corruption with CoW reflinks"},
	"cifs":      {Sendfile: "off", Warning: "Windows network share — sendfile not supported over SMB protocol. Consider local storage"},
	"ecryptfs":  {Sendfile: "off", Warning: "Encrypted filesystem layer — sendfile bypasses encryption"},
	"ext2":      {Sendfile: "on"},
	"ext3":      {Sendfile: "on"},
	"ext4":      {Sendfile: "on", Warning: "Native Linux filesystem — sendfile supported. Best performance for lancache"},
	"fuse":      {Sendfile: "off", Warning: "FUSE filesystems may not support sendfile correctly"},
	"fuseblk":   {Sendfile: "off", Warning: "FUSE block device (often ntfs-3g) — sendfile unreliable"},
	"glusterfs": {Sendfile: "off", Warning: "Network distributed filesystem — sendfile unreliable"},
	"nfs":       {Sendfile: "off", Warning: "Network filesystem — sendfile not supported. Consider local storage for best performance. NFS adds ~30-50% throughput overhead vs local mounts"},
	"nfs4":      {Sendfile: "off", Warning: "Network filesystem — sendfile not supported. Consider local storage for best performance. NFS adds ~30-50% throughput overhead vs local mounts"},
	"ntfs":      {Sendfile: "off", Warning: "NTFS via ntfs-3g FUSE — sendfile unreliable"},
	"overlay":   {Sendfile: "on"},
	"overlayfs": {Sendfile: "on"},
	"smb3":      {Sendfile: "off", Warning: "Windows network share — sendfile not supported over SMB protocol. Consider local storage"},
	"tmpfs":     {Sendfile: "on", Warning: "RAM-backed filesystem — sendfile supported. Fastest possible cache but volatile (lost on reboot)"},
	"virtiofs":  {Sendfile: "off", Warning: "VM shared folders — sendfile may cause silent corruption"},
	"xfs":       {Sendfile: "on", Warning: "Native Linux filesystem — sendfile supported. Best performance for lancache"},
	"zfs":       {Sendfile: "off", Warning: "ZFS uses copy-on-write — sendfile incompatible. ZFS RAIDZ1 random reads limited to single-drive speed (~80-120 MB/s)"},
}

func DetectFilesystem(path string) (models.FilesystemResponse, error) {
	output, err := RunCommand("df", "-T", path)
	if err != nil {
		return models.FilesystemResponse{}, err
	}

	fsType, device, mountPoint := ParseDfOutput(output)

	sendfileCurrent := EnvOrDefault("NGINX_SENDFILE", "on")

	sendfileRecommended := "on"
	warning := "Unknown filesystem — defaulting to sendfile=on. If you experience corruption, set NGINX_SENDFILE=off"

	if rec, ok := FsRecommendations[fsType]; ok {
		sendfileRecommended = rec.Sendfile
		warning = rec.Warning
	}

	mismatch := sendfileCurrent != sendfileRecommended

	return models.FilesystemResponse{
		Type:                fsType,
		MountPoint:          mountPoint,
		Device:              device,
		SendfileCurrent:     sendfileCurrent,
		SendfileRecommended: sendfileRecommended,
		Mismatch:            mismatch,
		Warning:             warning,
	}, nil
}

func ParseDfOutput(output string) (fsType, device, mountPoint string) {
	lines := strings.Split(output, "\n")
	if len(lines) < 2 {
		return "unknown", "unknown", "/data/cache"
	}

	dataLine := ""
	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed != "" && !strings.HasPrefix(trimmed, "Filesystem") {
			dataLine = trimmed
			break
		}
	}

	if dataLine == "" {
		return "unknown", "unknown", "/data/cache"
	}

	fields := strings.Fields(dataLine)
	if len(fields) < 7 {
		return "unknown", "unknown", "/data/cache"
	}

	device = fields[0]
	fsType = fields[1]
	mountPoint = fields[len(fields)-1]

	return fsType, device, mountPoint
}
