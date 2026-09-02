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
	ObserverPrompt   string                    `json:"observerPrompt"`
	AdvisorPrompt    string                    `json:"advisorPrompt"`
	LearningPrompt   string                    `json:"learningPrompt"`
	LearningExamples []ACUPrivatePromptExample `json:"learningExamples,omitempty"`
	Enabled          bool                      `json:"enabled"`
	PromptVersion    int64                     `json:"promptVersion"`
	Source           string                    `json:"source"`
	UpdatedAt        string                    `json:"updatedAt,omitempty"`
	UpdatedBy        string                    `json:"updatedBy,omitempty"`
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
	PromptCards     []ACUPrivatePromptCard   `json:"promptCards,omitempty"`
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
	PromptCards            []ACUPrivatePromptCard        `json:"promptCards,omitempty"`
}

type ACUPrivatePOCSpaceAccess struct {
	Key           string `json:"key"`
	SpaceID       string `json:"spaceId"`
	MemberUserIDs []int  `json:"memberUserIds"`
	Enabled       bool   `json:"enabled"`
}

type ACUPrivatePOCAccess struct {
	Spaces []ACUPrivatePOCSpaceAccess `json:"spaces"`
}

type ACUPrivateFilmMemberSpace struct {
	Key       string                  `json:"key"`
	TeamScope string                  `json:"teamScope,omitempty"`
	Skills    []ACUPrivateMemorySkill `json:"skills"`
}

type ACUPrivateFilmMemberView struct {
	Enabled bool                        `json:"enabled"`
	Spaces  []ACUPrivateFilmMemberSpace `json:"spaces"`
}

type ACUPrivateMemoryPrompt struct {
	Path    string `json:"path"`
	Mime    string `json:"mime"`
	Content string `json:"content"`
}

type ACUPrivatePromptExampleImage struct {
	URL      string `json:"url"`
	MimeType string `json:"mimeType,omitempty"`
	Alt      string `json:"alt,omitempty"`
}

type ACUPrivatePromptExampleMaterial struct {
	Text   string                         `json:"text,omitempty"`
	JSON   interface{}                    `json:"json,omitempty"`
	Images []ACUPrivatePromptExampleImage `json:"images,omitempty"`
}

type ACUPrivatePromptExampleArtifact struct {
	Format  string      `json:"format"`
	Content interface{} `json:"content"`
}

type ACUPrivatePromptExample struct {
	ID          string                          `json:"id"`
	Title       string                          `json:"title"`
	Origin      string                          `json:"origin"`
	Material    ACUPrivatePromptExampleMaterial `json:"material"`
	Artifact    ACUPrivatePromptExampleArtifact `json:"artifact"`
	SourceURL   string                          `json:"sourceUrl,omitempty"`
	SourceRunID string                          `json:"sourceRunId,omitempty"`
}

type ACUPrivatePromptCard struct {
	ID          string                    `json:"id"`
	Stage       string                    `json:"stage"`
	Title       string                    `json:"title"`
	Description string                    `json:"description"`
	Content     string                    `json:"content"`
	Language    string                    `json:"language"`
	Source      string                    `json:"source"`
	Execution   string                    `json:"execution"`
	Examples    []ACUPrivatePromptExample `json:"examples,omitempty"`
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

type ACUPrivateLearningRun struct {
	RunID            string                 `json:"runId"`
	LearningKind     string                 `json:"learningKind"`
	NewAPIUserID     string                 `json:"newapiUserId,omitempty"`
	TeamScope        string                 `json:"teamScope,omitempty"`
	SpaceID          string                 `json:"spaceId"`
	SessionID        string                 `json:"sessionId"`
	ExperienceID     string                 `json:"experienceId,omitempty"`
	Status           string                 `json:"status"`
	ElementCount     int64                  `json:"elementCount"`
	SkillChangeCount int64                  `json:"skillChangeCount"`
	ReceivedAt       string                 `json:"receivedAt"`
	CompletedAt      string                 `json:"completedAt,omitempty"`
	Error            map[string]interface{} `json:"error,omitempty"`
}

type ACUPrivateLearningRuns struct {
	Runs []ACUPrivateLearningRun `json:"runs"`
}

type ACUPrivateLearningRunMedia struct {
	MediaID    string                 `json:"mediaId"`
	ImageIndex int                    `json:"imageIndex"`
	MimeType   string                 `json:"mimeType"`
	Filename   string                 `json:"filename,omitempty"`
	Processing map[string]interface{} `json:"processing,omitempty"`
	URL        string                 `json:"url"`
}

type ACUPrivateLearningRunDetail struct {
	ACUPrivateLearningRun
	TaskID       string                       `json:"taskId,omitempty"`
	Evidence     map[string]interface{}       `json:"evidence"`
	Distillation map[string]interface{}       `json:"distillation"`
	SkillsBefore []ACUPrivateMemorySkill      `json:"skillsBefore"`
	SkillsAfter  []ACUPrivateMemorySkill      `json:"skillsAfter"`
	SkillChanges []map[string]interface{}     `json:"skillChanges"`
	Timeline     []map[string]interface{}     `json:"timeline"`
	Media        []ACUPrivateLearningRunMedia `json:"media"`
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
