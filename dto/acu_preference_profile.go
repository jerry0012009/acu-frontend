package dto

type ACUPreferenceRay struct {
	ID         string                           `json:"id"`
	Label      string                           `json:"label"`
	Category   string                           `json:"category"`
	Score      float64                          `json:"score"`
	Confidence float64                          `json:"confidence"`
	Summary    string                           `json:"summary"`
	Scope      string                           `json:"scope"`
	SourceIDs  []string                         `json:"sourceIds"`
	Evidence   []ACUPreferenceHighlightEvidence `json:"evidence,omitempty"`
}

type ACUPreferenceProfile struct {
	Summary     string                   `json:"summary"`
	Highlights  []ACUPreferenceHighlight `json:"highlights,omitempty"`
	Rays        []ACUPreferenceRay       `json:"rays"`
	SourceCount int                      `json:"sourceCount"`
	Excluded    []struct {
		SourceID string `json:"sourceId"`
		Reason   string `json:"reason"`
	} `json:"excluded"`
}

type ACUPreferenceHighlight struct {
	Title     string                           `json:"title"`
	Summary   string                           `json:"summary"`
	SourceIDs []string                         `json:"sourceIds"`
	Evidence  []ACUPreferenceHighlightEvidence `json:"evidence"`
}

type ACUPreferenceHighlightEvidence struct {
	SourceID string `json:"sourceId"`
	Quote    string `json:"quote"`
}

type ACUPreferenceProfileView struct {
	Status      string                `json:"status"`
	Profile     *ACUPreferenceProfile `json:"profile"`
	GeneratedAt *string               `json:"generatedAt"`
	Error       *string               `json:"error"`
}

type ACUTeamPreferenceSpace struct {
	Key     string                   `json:"key"`
	View    ACUPreferenceProfileView `json:"view"`
	Records []ACUPreferenceRecord    `json:"records"`
}

type ACUTeamPreferenceView struct {
	Version int                      `json:"version"`
	Spaces  []ACUTeamPreferenceSpace `json:"spaces"`
}
