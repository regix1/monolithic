package models

type EnvVar struct {
	Key         string   `json:"key"`
	Value       string   `json:"value"`
	Default     string   `json:"default"`
	Description string   `json:"description"`
	Type        string   `json:"type"`
	Options     []string `json:"options,omitempty"`
}

type ConfigGroup struct {
	Name string   `json:"name"`
	Vars []EnvVar `json:"vars"`
}

type ConfigResponse struct {
	Groups []ConfigGroup `json:"groups"`
}

type UpdateConfigResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}
