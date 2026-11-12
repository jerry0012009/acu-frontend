package dto

type ACUPreferenceRecord struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
}

type ACUPreferenceLibrary struct {
	Version int                   `json:"version"`
	Records []ACUPreferenceRecord `json:"records"`
}

type ACUPreferenceChange struct {
	PreferenceID string `json:"preferenceId"`
	Kind         string `json:"kind"`
	Before       string `json:"before"`
	After        string `json:"after"`
}

type ACUPreferenceChangeEvent struct {
	RunID      string                `json:"runId"`
	Trigger    string                `json:"trigger"`
	RecordedAt string                `json:"recordedAt"`
	Changes    []ACUPreferenceChange `json:"changes"`
}

// This is a bounded recent window, not a complete historical change log.
type ACUPreferenceActivity struct {
	Version       int                        `json:"version"`
	Events        []ACUPreferenceChangeEvent `json:"events"`
	InspectedRuns int                        `json:"inspectedRuns"`
	MoreAvailable bool                       `json:"moreAvailable"`
	Partial       bool                       `json:"partial"`
}
