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
	Enabled        bool   `json:"enabled"`
	PromptVersion  int64  `json:"promptVersion"`
	Source         string `json:"source"`
	UpdatedAt      string `json:"updatedAt,omitempty"`
	UpdatedBy      string `json:"updatedBy,omitempty"`
}

type ACUPrivatePromptsRequest struct {
	ObserverPrompt string `json:"observerPrompt" binding:"required"`
	AdvisorPrompt  string `json:"advisorPrompt" binding:"required"`
	LearningPrompt string `json:"learningPrompt" binding:"required"`
	Enabled        *bool  `json:"enabled"`
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
	Enabled         bool                     `json:"enabled"`
	UserID          string                   `json:"userId"`
	SpaceID         string                   `json:"spaceId,omitempty"`
	Skills          []ACUPrivateMemorySkill  `json:"skills"`
	InternalPrompts []ACUPrivateMemoryPrompt `json:"internalPrompts,omitempty"`
}

type ACUPrivateFilmImagePolicy struct {
	MaxImages          int    `json:"maxImages"`
	MaxInputImageBytes int64  `json:"maxInputImageBytes"`
	MaxInputTotalBytes int64  `json:"maxInputTotalBytes"`
	MaxModelImageBytes int64  `json:"maxModelImageBytes"`
	MaxModelTotalBytes int64  `json:"maxModelTotalBytes"`
	MaxImageDimension  int    `json:"maxImageDimension"`
	OutputMimeType     string `json:"outputMimeType"`
	CompressionPolicy  string `json:"compressionPolicy"`
}

type ACUPrivateFilmLastSubmission struct {
	ExperienceID       string                                 `json:"experienceId"`
	SessionID          string                                 `json:"sessionId"`
	SubmittedAt        string                                 `json:"submittedAt"`
	ImageCount         int                                    `json:"imageCount"`
	ReceivedImageBytes int64                                  `json:"receivedImageBytes"`
	PreparedImageBytes int64                                  `json:"preparedImageBytes"`
	Images             []ACUPrivateFilmImageProcessingSummary `json:"images"`
}

type ACUPrivateFilmImageProcessingSummary struct {
	ImageIndex     int    `json:"imageIndex"`
	Mode           string `json:"mode"`
	InputBytes     int64  `json:"inputBytes"`
	OutputBytes    int64  `json:"outputBytes"`
	InputWidth     int    `json:"inputWidth"`
	InputHeight    int    `json:"inputHeight"`
	OutputWidth    int    `json:"outputWidth"`
	OutputHeight   int    `json:"outputHeight"`
	OutputMimeType string `json:"outputMimeType"`
	Quality        *int   `json:"quality,omitempty"`
}

type ACUPrivateFilmStatus struct {
	Enabled                bool                          `json:"enabled"`
	TeamScope              string                        `json:"teamScope,omitempty"`
	AcontextUser           string                        `json:"acontextUser,omitempty"`
	SpaceID                string                        `json:"spaceId,omitempty"`
	LearningModel          string                        `json:"learningModel,omitempty"`
	IngressTokenConfigured bool                          `json:"ingressTokenConfigured"`
	ImagePolicy            *ACUPrivateFilmImagePolicy    `json:"imagePolicy,omitempty"`
	LastSubmission         *ACUPrivateFilmLastSubmission `json:"lastSubmission,omitempty"`
	Skills                 []ACUPrivateMemorySkill       `json:"skills"`
}

type ACUPrivateMemoryPrompt struct {
	Path    string `json:"path"`
	Mime    string `json:"mime"`
	Content string `json:"content"`
}

type ACUPrivateExperience struct {
	ExperienceID      string      `json:"experienceId"`
	CreatedAt         string      `json:"createdAt"`
	LearningCalls     int64       `json:"learningCalls"`
	LearningSuccesses int64       `json:"learningSuccesses"`
	Advisor           *ACUAdvisor `json:"advisor,omitempty"`
}

type ACUPrivateExperiences struct {
	Experiences []ACUPrivateExperience `json:"experiences"`
}

type ACUPrivateExperienceDetail struct {
	ExperienceID string                 `json:"experienceId"`
	Ledger       []ACUPrivateUsageEntry `json:"ledger"`
	Advisor      *ACUAdvisor            `json:"advisor,omitempty"`
}

type ACUPrivateUsageEntry struct {
	LedgerID                string  `json:"ledgerId"`
	NewAPIUserID            string  `json:"newapiUserId"`
	NewAPITokenID           string  `json:"newapiTokenId,omitempty"`
	LogicalRequestID        string  `json:"logicalRequestId"`
	Stage                   string  `json:"stage"`
	Provider                string  `json:"provider,omitempty"`
	Model                   string  `json:"model,omitempty"`
	UpstreamRequestID       string  `json:"upstreamRequestId,omitempty"`
	InputTokens             int64   `json:"inputTokens"`
	CachedInputTokens       int64   `json:"cachedInputTokens"`
	OutputTokens            int64   `json:"outputTokens"`
	TotalTokens             int64   `json:"totalTokens"`
	UsageStatus             string  `json:"usageStatus"`
	Status                  string  `json:"status"`
	NominalCostUSD          string  `json:"nominalCostUsd"`
	ActualCostCNY           string  `json:"actualCostCny"`
	UserChargeCNY           string  `json:"userChargeCny"`
	BillingMarkupMultiplier float64 `json:"billingMarkupMultiplier"`
	BillingStatus           string  `json:"billingStatus"`
	BillingAttemptCount     int     `json:"billingAttemptCount"`
	BillingLastError        string  `json:"billingLastError,omitempty"`
	CreatedAt               string  `json:"createdAt"`
}

type ACUPrivateUsageTotal struct {
	Stage             string `json:"stage"`
	Status            string `json:"status"`
	Calls             int64  `json:"calls"`
	InputTokens       int64  `json:"inputTokens"`
	CachedInputTokens int64  `json:"cachedInputTokens"`
	OutputTokens      int64  `json:"outputTokens"`
	TotalTokens       int64  `json:"totalTokens"`
	ActualCostCNY     string `json:"actualCostCny"`
	UserChargeCNY     string `json:"userChargeCny"`
}

type ACUPrivateUsage struct {
	Entries []ACUPrivateUsageEntry `json:"entries"`
	Totals  []ACUPrivateUsageTotal `json:"totals"`
}
