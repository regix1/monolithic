package models

type DomainService struct {
	Files       []string `json:"files"`
	DomainCount int      `json:"domain_count"`
}
