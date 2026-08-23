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

type ACUPrivatePrompts struct {
	ObserverPrompt string `json:"observerPrompt"`
	AdvisorPrompt  string `json:"advisorPrompt"`
	LearningPrompt string `json:"learningPrompt"`
	PromptVersion  int64  `json:"promptVersion"`
	Source         string `json:"source"`
	UpdatedAt      string `json:"updatedAt,omitempty"`
	UpdatedBy      string `json:"updatedBy,omitempty"`
}

type ACUPrivatePromptsRequest struct {
	ObserverPrompt string `json:"observerPrompt" binding:"required"`
	AdvisorPrompt  string `json:"advisorPrompt" binding:"required"`
	LearningPrompt string `json:"learningPrompt" binding:"required"`
}

type ACUPrivateMemoryFile struct {
	Path    string `json:"path"`
	Mime    string `json:"mime"`
	Content string `json:"content,omitempty"`
	URL     string `json:"url,omitempty"`
}

type ACUPrivateMemorySkill struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Files       []ACUPrivateMemoryFile `json:"files"`
}

type ACUPrivateMemory struct {
	Enabled bool                    `json:"enabled"`
	UserID  string                  `json:"userId"`
	SpaceID string                  `json:"spaceId,omitempty"`
	Skills  []ACUPrivateMemorySkill `json:"skills"`
}
