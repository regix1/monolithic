package handlers

import (
	"net/http"
	"strings"
)

type FilesystemResponse struct {
	Type                string `json:"type"`
	MountPoint          string `json:"mount_point"`
	Device              string `json:"device"`
	SendfileCurrent     string `json:"sendfile_current"`
	SendfileRecommended string `json:"sendfile_recommended"`
	Mismatch            bool   `json:"mismatch"`
	Warning             string `json:"warning,omitempty"`
}

type fsRecommendation struct {
	Sendfile string
	Warning  string
}

var fsRecommendations = map[string]fsRecommendation{
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

func Filesystem(w http.ResponseWriter, r *http.Request) {
	output, err := runCommand("df", "-T", "/data/cache")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query filesystem: "+err.Error())
		return
	}

	fsType, device, mountPoint := parseDfOutput(output)

	sendfileCurrent := envOrDefault("NGINX_SENDFILE", "on")

	sendfileRecommended := "on"
	warning := ""

	if rec, ok := fsRecommendations[fsType]; ok {
		sendfileRecommended = rec.Sendfile
		warning = rec.Warning
	}

	mismatch := sendfileCurrent != sendfileRecommended

	resp := FilesystemResponse{
		Type:                fsType,
		MountPoint:          mountPoint,
		Device:              device,
		SendfileCurrent:     sendfileCurrent,
		SendfileRecommended: sendfileRecommended,
		Mismatch:            mismatch,
		Warning:             warning,
	}

	writeJSON(w, resp)
}

// parseDfOutput extracts filesystem type, device, and mount point from df -T output.
// Expected format:
//
//	Filesystem                        Type  1K-blocks     Used Available Use% Mounted on
//	192.168.50.100:/volume1/lancache   nfs4  1000000000 487200000 512800000  49% /data/cache
func parseDfOutput(output string) (fsType, device, mountPoint string) {
	lines := strings.Split(output, "\n")
	if len(lines) < 2 {
		return "unknown", "unknown", "/data/cache"
	}

	// The data line is the last non-empty line
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
