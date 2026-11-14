package dto

type ACUWorkRecord struct {
	ID         string                `json:"id"`
	Kind       string                `json:"kind"`
	OccurredAt string                `json:"occurredAt"`
	Title      string                `json:"title"`
	Summary    string                `json:"summary"`
	Basis      string                `json:"basis"`
	State      string                `json:"state"`
	Detail     string                `json:"detail,omitempty"`
	Rationale  string                `json:"rationale,omitempty"`
	Changes    []ACUPreferenceChange `json:"changes,omitempty"`
	Sources    []ACUWorkSource       `json:"sources,omitempty"`
	RequestID  string                `json:"requestId,omitempty"`
	AdvisorID  string                `json:"advisorId,omitempty"`
}
type ACUWorkSource struct {
	Scope string `json:"scope"`
	Quote string `json:"quote"`
}
type ACUWorkReview struct {
	Version       int             `json:"version"`
	Items         []ACUWorkRecord `json:"items"`
	Unavailable   []string        `json:"unavailable"`
	MoreAvailable bool            `json:"moreAvailable"`
}
