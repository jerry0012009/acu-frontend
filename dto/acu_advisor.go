package dto

type ACUAdvisor struct {
	AdvisorID        string                 `json:"advisorId"`
	NewAPIUserID     string                 `json:"newapiUserId"`
	LogicalRequestID string                 `json:"logicalRequestId"`
	TriggerCallCount int64                  `json:"triggerCallCount"`
	NeedAdvisor      bool                   `json:"needAdvisor"`
	Status           string                 `json:"status"`
	Problem          string                 `json:"problem"`
	Advice           string                 `json:"advice,omitempty"`
	Learn            string                 `json:"learn"`
	RelevantSkillIDs []string               `json:"relevantSkillIds"`
	CreatedAt        string                 `json:"createdAt"`
	UserFeedback     string                 `json:"userFeedback,omitempty"`
	FeedbackAt       string                 `json:"feedbackAt,omitempty"`
	ObserverResult   map[string]interface{} `json:"observerResult,omitempty"`
	AdvisorResult    map[string]interface{} `json:"advisorResult,omitempty"`
}

type ACUAdvisorList struct {
	Advisors []ACUAdvisor `json:"advisors"`
}

type ACUAdvisorFeedbackRequest struct {
	Feedback string `json:"feedback" binding:"required,oneof=helpful inaccurate ignored"`
}
