package services

import (
	"strings"

	"github.com/lancachenet/monolithic/admin/models"
)

var FsRecommendations = map[string]models.FsRecommendation{
	"ext4":  {Sendfile: "on"},
	"xfs":   {Sendfile: "on"},
	"tmpfs": {Sendfile: "on"},
	"btrfs": {Sendfile: "off", Warning: "btrfs CoW can cause I/O errors with sendfile"},
	"zfs":   {Sendfile: "off", Warning: "ZFS ARC conflicts with kernel page cache"},
	"nfs":   {Sendfile: "off", Warning: "NFS can serve wrong content with sendfile (nginx ticket #1750)"},
	"nfs4":  {Sendfile: "off", Warning: "NFS can serve wrong content with sendfile (nginx ticket #1750)"},
	"cifs":  {Sendfile: "off", Warning: "CIFS/SMB has stale file handle issues"},
	"smb3":  {Sendfile: "off", Warning: "CIFS/SMB has stale file handle issues"},
	"fuse":  {Sendfile: "off", Warning: "FUSE filesystems may not support sendfile correctly"},
}

func DetectFilesystem(path string) (models.FilesystemResponse, error) {
	output, err := RunCommand("df", "-T", path)
	if err != nil {
		return models.FilesystemResponse{}, err
	}

	fsType, device, mountPoint := ParseDfOutput(output)

	sendfileCurrent := EnvOrDefault("NGINX_SENDFILE", "on")

	sendfileRecommended := "on"
	warning := ""

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
