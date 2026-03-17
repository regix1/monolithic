package models

type FilesystemResponse struct {
	Type                string `json:"type"`
	MountPoint          string `json:"mount_point"`
	Device              string `json:"device"`
	SendfileCurrent     string `json:"sendfile_current"`
	SendfileRecommended string `json:"sendfile_recommended"`
	Mismatch            bool   `json:"mismatch"`
	Warning             string `json:"warning,omitempty"`
}

type FsRecommendation struct {
	Sendfile string
	Warning  string
}
