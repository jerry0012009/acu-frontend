package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

type acuRawTrace struct {
	Session          acuRawSession           `json:"session"`
	Task             acuRawTask              `json:"task"`
	Segments         []acuRawSegment         `json:"segments"`
	JudgeEvaluations []acuRawJudgeEvaluation `json:"judge_evaluations"`
	AdmissionTraces  []acuRawAdmissionTrace  `json:"admission_traces"`
	JudgeAttempts    []acuRawJudgeAttempt    `json:"judge_attempts"`
	RouteDecisions   []acuRawRouteDecision   `json:"route_decisions"`
	LogicalRequests  []acuRawLogicalRequest  `json:"logical_requests"`
	Attempts         []acuRawProviderAttempt `json:"attempts"`
	UsageReports     []acuRawUsageReport     `json:"usage_reports"`
	Payloads         []acuRawPayload         `json:"payloads"`
}

type acuRawSession struct {
	SessionID      string `json:"session_id"`
	CreatedAt      string `json:"created_at"`
	LastActivityAt string `json:"last_activity_at"`
}

type acuRawTask struct {
	TaskID       string `json:"task_id"`
	RootGoalText string `json:"root_goal_text"`
	Status       string `json:"status"`
}

type acuRawSegment struct {
	SegmentID         string `json:"segment_id"`
	PreviousSegmentID string `json:"previous_segment_id"`
	CreationReason    string `json:"creation_reason"`
	Phase             string `json:"phase"`
	Status            string `json:"status"`
	JudgeEvaluationID string `json:"judge_evaluation_id"`
	RouteDecisionID   string `json:"route_decision_id"`
	CreatedAt         string `json:"created_at"`
	SupersededAt      string `json:"superseded_at"`
}

type acuRawJudgeEvaluation struct {
	EvaluationID string  `json:"judge_evaluation_id"`
	SegmentID    string  `json:"segment_id"`
	Model        string  `json:"judge_model"`
	Provider     string  `json:"judge_provider"`
	Status       string  `json:"judge_status"`
	Difficulty   float64 `json:"difficulty_index"`
	Confidence   float64 `json:"confidence"`
	Explanation  string  `json:"explanation"`
	InputTokens  int64   `json:"prompt_tokens"`
	OutputTokens int64   `json:"completion_tokens"`
	LatencyMs    int     `json:"latency_ms"`
	ResultSource string  `json:"judge_result_source"`
}

type acuRawAdmissionTrace struct {
	SegmentID         string                 `json:"segment_id"`
	LogicalRequestID  string                 `json:"logical_request_id"`
	JudgeEvaluationID string                 `json:"judge_evaluation_id"`
	Metadata          map[string]interface{} `json:"metadata_json"`
}

type acuRawJudgeAttempt struct {
	AttemptID     string `json:"judge_attempt_id"`
	EvaluationID  string `json:"judge_evaluation_id"`
	Role          string `json:"attempt_role"`
	Model         string `json:"model"`
	Provider      string `json:"provider"`
	Status        string `json:"status"`
	ErrorCategory string `json:"error_category"`
	HTTPStatus    int    `json:"http_status"`
	LatencyMs     int    `json:"latency_ms"`
}

type acuRawRouteDecision struct {
	RouteDecisionID        string                 `json:"route_decision_id"`
	SegmentID              string                 `json:"segment_id"`
	Mode                   string                 `json:"mode"`
	FormulaInputs          map[string]interface{} `json:"formula_inputs_json"`
	Candidates             []interface{}          `json:"candidate_estimates_json"`
	ParetoFrontier         []string               `json:"pareto_frontier_json"`
	SelectedProfile        map[string]interface{} `json:"selected_profile_json"`
	Explanation            string                 `json:"route_explanation"`
	EffectiveQualityTarget *float64               `json:"effective_quality_target"`
}

type acuRawLogicalRequest struct {
	LogicalRequestID string                 `json:"logical_request_id"`
	SegmentID        string                 `json:"segment_id"`
	NewAPILogID      string                 `json:"newapi_log_id"`
	RequestedModel   string                 `json:"requested_model"`
	Status           string                 `json:"status"`
	StartedAt        string                 `json:"started_at"`
	CompletedAt      string                 `json:"completed_at"`
	Metadata         map[string]interface{} `json:"metadata_json"`
}

type acuRawProviderAttempt struct {
	AttemptID          string                 `json:"attempt_id"`
	LogicalRequestID   string                 `json:"logical_request_id"`
	AttemptIndex       int                    `json:"attempt_index"`
	ActualModel        string                 `json:"actual_model"`
	Provider           string                 `json:"provider"`
	Channel            string                 `json:"channel"`
	Endpoint           string                 `json:"network_endpoint"`
	Status             string                 `json:"status"`
	HTTPStatus         int                    `json:"http_status"`
	ErrorCategory      string                 `json:"error_category"`
	StartedAt          string                 `json:"started_at"`
	CompletedAt        string                 `json:"completed_at"`
	LatencyMs          int                    `json:"latency_ms"`
	VisibleOutputBytes int64                  `json:"visible_output_bytes"`
	Metadata           map[string]interface{} `json:"metadata_json"`
}

type acuRawUsageReport struct {
	LogicalRequestID       string   `json:"logical_request_id"`
	ActualModel            string   `json:"actual_model"`
	UserChargeCNY          *float64 `json:"user_charge_cny"`
	ActualTotalCashCostCNY *float64 `json:"actual_total_cash_cost_cny"`
	InputTokens            int64    `json:"input_tokens"`
	CachedInputTokens      int64    `json:"cached_input_tokens"`
	OutputTokens           int64    `json:"output_tokens"`
	ReasoningTokens        int64    `json:"reasoning_tokens"`
}

type acuRawPayload struct {
	LogicalRequestID string                 `json:"logical_request_id"`
	AttemptID        string                 `json:"attempt_id"`
	PayloadKind      string                 `json:"payload_kind"`
	Headers          map[string]interface{} `json:"headers_sanitized_json"`
	Metadata         map[string]interface{} `json:"metadata_json"`
}

func GetOwnedACUSessionTrace(ctx context.Context, userID int, identifier string) (dto.ACUSessionTrace, error) {
	logicalRequestID, err := model.ResolveOwnedACULogicalRequest(userID, identifier)
	if err != nil {
		return dto.ACUSessionTrace{}, err
	}
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("ACU_ROUTER_INTERNAL_URL")), "/")
	token := strings.TrimSpace(os.Getenv("ACU_ADMIN_TRACE_TOKEN"))
	if baseURL == "" || token == "" {
		return dto.ACUSessionTrace{}, errors.New("ACU Session Trace is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/internal/admin/traces/"+logicalRequestID, nil)
	if err != nil {
		return dto.ACUSessionTrace{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	response, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return dto.ACUSessionTrace{}, fmt.Errorf("ACU Session Trace request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUSessionTrace{}, fmt.Errorf("ACU Session Trace returned HTTP %d", response.StatusCode)
	}
	var raw acuRawTrace
	if err := common.DecodeJson(response.Body, &raw); err != nil {
		return dto.ACUSessionTrace{}, fmt.Errorf("ACU Session Trace response is invalid: %w", err)
	}
	return buildACUSessionTrace(raw), nil
}

func buildACUSessionTrace(raw acuRawTrace) dto.ACUSessionTrace {
	evaluations := make(map[string]acuRawJudgeEvaluation, len(raw.JudgeEvaluations))
	for _, evaluation := range raw.JudgeEvaluations {
		evaluations[evaluation.EvaluationID] = evaluation
	}
	judgeAttempts := make(map[string][]dto.ACUSessionTraceJudgeAttempt)
	backupReasons := make(map[string]string)
	for _, payload := range raw.Payloads {
		if payload.PayloadKind != "judge_attempt_error_response" {
			continue
		}
		attemptID := stringField(payload.Metadata, "judgeAttemptId")
		backupReasons[attemptID] = stringField(payload.Metadata, "backupReason")
	}
	for _, attempt := range raw.JudgeAttempts {
		judgeAttempts[attempt.EvaluationID] = append(judgeAttempts[attempt.EvaluationID], dto.ACUSessionTraceJudgeAttempt{
			Role: attempt.Role, Model: attempt.Model, Provider: attempt.Provider, Status: attempt.Status,
			ErrorCategory: attempt.ErrorCategory, HTTPStatus: attempt.HTTPStatus, LatencyMs: attempt.LatencyMs,
			BackupReason: backupReasons[attempt.AttemptID],
		})
	}
	admissions := make(map[string]acuRawAdmissionTrace)
	for _, admission := range raw.AdmissionTraces {
		current, exists := admissions[admission.SegmentID]
		if !exists || intField(admission.Metadata, "judgeCalls") > intField(current.Metadata, "judgeCalls") {
			admissions[admission.SegmentID] = admission
		}
	}
	routes := make(map[string]acuRawRouteDecision, len(raw.RouteDecisions))
	for _, route := range raw.RouteDecisions {
		routes[route.RouteDecisionID] = route
	}
	requests := make(map[string][]acuRawLogicalRequest)
	for _, request := range raw.LogicalRequests {
		requests[request.SegmentID] = append(requests[request.SegmentID], request)
	}
	attemptsByRequest := make(map[string][]acuRawProviderAttempt)
	for _, attempt := range raw.Attempts {
		attemptsByRequest[attempt.LogicalRequestID] = append(attemptsByRequest[attempt.LogicalRequestID], attempt)
	}
	usageByRequest := make(map[string]acuRawUsageReport)
	for _, usage := range raw.UsageReports {
		usageByRequest[usage.LogicalRequestID] = usage
	}
	payloadsByRequest := make(map[string][]acuRawPayload)
	for _, payload := range raw.Payloads {
		payloadsByRequest[payload.LogicalRequestID] = append(payloadsByRequest[payload.LogicalRequestID], payload)
	}

	segments := make([]dto.ACUSessionTraceSegment, 0, len(raw.Segments))
	latestExplanation := ""
	for _, evaluation := range raw.JudgeEvaluations {
		if evaluation.Explanation != "" {
			latestExplanation = evaluation.Explanation
		}
	}
	for _, segment := range raw.Segments {
		entry := dto.ACUSessionTraceSegment{
			SegmentID: segment.SegmentID, PreviousSegmentID: segment.PreviousSegmentID,
			CreationReason: segment.CreationReason, Phase: segment.Phase, Status: segment.Status,
			StartedAt: segment.CreatedAt, CompletedAt: segment.SupersededAt,
			LogicalRequests:  []dto.ACUSessionTraceLogicalRequest{},
			ProviderAttempts: []dto.ACUSessionTraceProviderAttempt{},
			WorkPhase:        segment.Phase,
		}
		if segment.JudgeEvaluationID == "" {
			entry.JudgeStatusReason = judgeStatusReason(requests[segment.SegmentID])
		}
		admission := admissions[segment.SegmentID]
		if evaluation, ok := evaluations[segment.JudgeEvaluationID]; ok {
			judgeCalls := intField(admission.Metadata, "judgeCalls")
			entry.Judge = &dto.ACUSessionTraceJudge{
				Trigger: stringField(admission.Metadata, "trigger"), JudgeCalls: judgeCalls,
				JudgeReused:             judgeCalls == 0 && boolField(admission.Metadata, "judgeReused"),
				ReusedJudgeEvaluationID: stringField(admission.Metadata, "reusedJudgeEvaluationId"),
				RouteRefreshReason:      stringField(admission.Metadata, "routeRefreshReason"),
				EvaluationID:            evaluation.EvaluationID, Model: evaluation.Model, Provider: evaluation.Provider,
				Status: evaluation.Status, ResultSource: evaluation.ResultSource, Difficulty: evaluation.Difficulty, Confidence: evaluation.Confidence,
				Explanation: evaluation.Explanation, InputTokens: evaluation.InputTokens,
				OutputTokens: evaluation.OutputTokens, LatencyMs: evaluation.LatencyMs,
				Attempts: judgeAttempts[evaluation.EvaluationID],
			}
		}
		if route, ok := routes[segment.RouteDecisionID]; ok {
			selectedModel := stringField(route.SelectedProfile, "modelId")
			selectedProvider := stringField(route.SelectedProfile, "provider")
			selectedChannel := stringField(route.SelectedProfile, "channel")
			decision := mapField(route.FormulaInputs, "decisionSnapshot")
			entry.WorkPhase = firstNonEmpty(stringField(decision, "workPhase"), stringField(route.FormulaInputs, "workPhase"), segment.Phase)
			entry.WorkPhaseQualityTargetOffset = numberField(decision, "workPhaseQualityTargetOffset")
			if entry.WorkPhaseQualityTargetOffset == 0 {
				entry.WorkPhaseQualityTargetOffset = numberField(route.FormulaInputs, "workPhaseQualityTargetOffset")
			}
			selectedCandidateID := firstNonEmpty(stringField(decision, "selectedCandidateId"), selectedModel)
			entry.Route = &dto.ACUSessionTraceRoute{
				RouteDecisionID: route.RouteDecisionID, RequestedModel: route.Mode,
				SelectedCanonicalModel: selectedModel, SelectedProvider: selectedProvider,
				SelectedChannel:        selectedChannel,
				ModelSelectionReason:   firstNonEmpty(stringField(decision, "modelSelectionReason"), route.Explanation),
				ChannelSelectionReason: firstNonEmpty(stringField(decision, "channelSelectionReason"), route.Explanation),
				CandidateCount:         len(route.Candidates), ParetoFrontier: route.ParetoFrontier,
				SelectedCandidateID:            selectedCandidateID,
				SelectedDisplayName:            firstNonEmpty(stringField(decision, "selectedDisplayName"), selectedModel),
				SelectedExecutionPresetID:      stringField(decision, "selectedExecutionPresetId"),
				ClientRequestedReasoningEffort: stringField(decision, "clientRequestedReasoningEffort"),
				PresetReasoningEffort:          stringField(decision, "presetReasoningEffort"),
				TargetCanonicalReasoningEffort: stringField(decision, "targetCanonicalReasoningEffort"),
				ResolvedReasoningEffort:        stringField(decision, "resolvedReasoningEffort"),
				ReasoningMappingStatus:         firstNonEmpty(stringField(decision, "reasoningMappingStatus"), stringField(decision, "mappingStatus")),
				TopCandidates:                  traceTopCandidates(route.Candidates, selectedCandidateID),
				EffectiveQualityTarget:         route.EffectiveQualityTarget,
			}
		}
		for _, request := range requests[segment.SegmentID] {
			requestAttempts := attemptsByRequest[request.LogicalRequestID]
			usage := usageByRequest[request.LogicalRequestID]
			visibleBytes := int64(0)
			var firstTokenLatencyMs *int
			for _, attempt := range requestAttempts {
				visibleBytes += attempt.VisibleOutputBytes
				if value := firstNonZeroInt(attempt.Metadata, "first_model_event_latency_ms", "firstTokenLatencyMs"); value > 0 && firstTokenLatencyMs == nil {
					firstTokenLatencyMs = &value
				}
				entry.ProviderAttempts = append(entry.ProviderAttempts, providerAttemptDTO(attempt))
			}
			actualCostCNY := 0.0
			if usage.ActualTotalCashCostCNY != nil {
				actualCostCNY = *usage.ActualTotalCashCostCNY
			}
			logical := dto.ACUSessionTraceLogicalRequest{
				LogicalRequestID: request.LogicalRequestID, NewAPILogID: request.NewAPILogID,
				RequestID: stringField(request.Metadata, "requestId"), RequestedModel: request.RequestedModel,
				ActualModel: usage.ActualModel, Status: request.Status, StartedAt: request.StartedAt,
				CompletedAt: request.CompletedAt, TotalLatencyMs: durationMs(request.StartedAt, request.CompletedAt),
				FirstTokenLatencyMs: firstTokenLatencyMs, VisibleOutputBytes: visibleBytes,
				UserChargeCNY: usage.UserChargeCNY, ActualCashCostCNY: usage.ActualTotalCashCostCNY, ActualCostCNY: actualCostCNY,
				InputTokens: usage.InputTokens, CachedInputTokens: usage.CachedInputTokens,
				OutputTokens: usage.OutputTokens, ReasoningTokens: usage.ReasoningTokens,
				DeliveryStatus: stringField(request.Metadata, "deliveryStatus"),
			}
			logical.ErrorDiagnosis = errorDiagnosis(requestAttempts, payloadsByRequest[request.LogicalRequestID])
			entry.LogicalRequests = append(entry.LogicalRequests, logical)
		}
		segments = append(segments, entry)
	}
	goalSummary := strings.TrimSpace(raw.Task.RootGoalText)
	if strings.HasPrefix(goalSummary, "<environment_context>") || goalSummary == "" {
		goalSummary = latestExplanation
	}
	goalSummary = truncateRunes(goalSummary, 320)
	return dto.ACUSessionTrace{
		Session: dto.ACUSessionTraceSession{SessionID: raw.Session.SessionID, Status: raw.Task.Status,
			StartedAt: raw.Session.CreatedAt, LastActivityAt: raw.Session.LastActivityAt},
		Task:     dto.ACUSessionTraceTask{TaskID: raw.Task.TaskID, GoalSummary: goalSummary, Status: raw.Task.Status},
		Segments: segments,
	}
}

// PublicACUSessionTrace projects the internally built trace for a regular
// user's /self response. Ownership is enforced before this projection.
func PublicACUSessionTrace(trace dto.ACUSessionTrace) dto.ACUSessionTrace {
	for segmentIndex := range trace.Segments {
		segment := &trace.Segments[segmentIndex]
		for requestIndex := range segment.LogicalRequests {
			request := &segment.LogicalRequests[requestIndex]
			request.ActualCashCostCNY = nil
			request.ActualCostCNY = 0
		}
		if segment.Route == nil {
			continue
		}
		for candidateIndex := range segment.Route.TopCandidates {
			segment.Route.TopCandidates[candidateIndex].EstimatedCallCost = 0
		}
	}
	return trace
}

func providerAttemptDTO(attempt acuRawProviderAttempt) dto.ACUSessionTraceProviderAttempt {
	recoveryReason := ""
	if attempt.AttemptIndex > 1 {
		recoveryReason = "same_model_channel_recovery"
	}
	var firstTokenLatencyMs *int
	if value := firstNonZeroInt(attempt.Metadata, "first_model_event_latency_ms", "firstTokenLatencyMs"); value > 0 {
		firstTokenLatencyMs = &value
	}
	return dto.ACUSessionTraceProviderAttempt{
		AttemptIndex: attempt.AttemptIndex, Model: attempt.ActualModel, Provider: attempt.Provider,
		Channel: attempt.Channel, Endpoint: attempt.Endpoint, Status: attempt.Status,
		HTTPStatus: attempt.HTTPStatus, ErrorCategory: attempt.ErrorCategory,
		StartedAt: attempt.StartedAt, CompletedAt: attempt.CompletedAt, LatencyMs: attempt.LatencyMs,
		FirstTokenLatencyMs: firstTokenLatencyMs,
		VisibleOutputBytes:  attempt.VisibleOutputBytes, RecoveryReason: recoveryReason,
	}
}

func errorDiagnosis(attempts []acuRawProviderAttempt, payloads []acuRawPayload) *dto.ACUErrorDiagnosis {
	if len(attempts) == 0 {
		return nil
	}
	var failed *acuRawProviderAttempt
	for index := range attempts {
		if attempts[index].Status != "success" && !isNeutralClientCancellation(attempts[index]) {
			failed = &attempts[index]
		}
	}
	if failed == nil {
		return nil
	}
	server := ""
	cfRay := ""
	for _, payload := range payloads {
		if payload.PayloadKind != "provider_response" && payload.PayloadKind != "provider_stream" {
			continue
		}
		if payload.AttemptID != "" && payload.AttemptID != failed.AttemptID {
			continue
		}
		server = stringField(payload.Headers, "server")
		cfRay = stringField(payload.Headers, "cf-ray")
	}
	source := "execution_provider"
	if strings.EqualFold(server, "cloudflare") {
		source = "execution_provider_cloudflare"
	}
	recoveryEligible := failed.HTTPStatus == 429 || failed.HTTPStatus == 500 || failed.HTTPStatus == 502 || failed.HTTPStatus == 503 || failed.HTTPStatus == 504
	reason := ""
	if !recoveryEligible {
		reason = fmt.Sprintf("HTTP %d was not recovery-eligible in the running Router build", failed.HTTPStatus)
	}
	firstByteReceived := firstNonZeroInt(failed.Metadata, "first_model_event_latency_ms", "firstTokenLatencyMs") > 0
	return &dto.ACUErrorDiagnosis{ErrorSource: source, Endpoint: failed.Endpoint, CFRay: cfRay,
		FirstByteReceived: firstByteReceived, VisibleBytes: failed.VisibleOutputBytes, RecoveryEligible: recoveryEligible,
		RecoveryExecuted: len(attempts) > 1, RecoveryReason: reason}
}

func isNeutralClientCancellation(attempt acuRawProviderAttempt) bool {
	if attempt.Status != "cancelled" {
		return false
	}
	if attempt.HTTPStatus == 499 {
		return true
	}
	return attempt.HTTPStatus == http.StatusOK &&
		stringField(attempt.Metadata, "deliveryStatus") == "client_cancelled_after_output"
}

func judgeStatusReason(requests []acuRawLogicalRequest) string {
	for _, request := range requests {
		message := stringField(request.Metadata, "routingErrorMessage")
		if strings.Contains(message, "acu_judge_attempts") && strings.Contains(message, "constraint") {
			return "Judge result could not be persisted"
		}
	}
	if len(requests) > 0 {
		return "Request did not reach a persisted Judge evaluation"
	}
	return "Legacy segment has no Judge record"
}

func firstNonZeroInt(value map[string]interface{}, keys ...string) int {
	for _, key := range keys {
		if result := intField(value, key); result > 0 {
			return result
		}
	}
	return 0
}

func stringField(value map[string]interface{}, key string) string {
	if value == nil {
		return ""
	}
	text, _ := value[key].(string)
	return text
}

func intField(value map[string]interface{}, key string) int {
	if value == nil {
		return 0
	}
	number, _ := value[key].(float64)
	return int(number)
}

func numberField(value map[string]interface{}, key string) float64 {
	if value == nil {
		return 0
	}
	number, _ := value[key].(float64)
	return number
}

func traceTopCandidates(values []interface{}, selectedCandidateID string) []dto.ACUSessionTraceCandidateSummary {
	candidates := make([]dto.ACUSessionTraceCandidateSummary, 0, len(values))
	for _, value := range values {
		candidate, _ := value.(map[string]interface{})
		if candidate == nil {
			continue
		}
		candidateID := firstNonEmpty(stringField(candidate, "candidateId"), stringField(candidate, "modelId"))
		candidates = append(candidates, dto.ACUSessionTraceCandidateSummary{
			CandidateID: candidateID, DisplayName: firstNonEmpty(stringField(candidate, "displayName"), stringField(candidate, "modelId")),
			EstimatedQuality:  numberField(candidate, "estimatedQuality"),
			EstimatedCallCost: numberField(candidate, "estimatedCallCost"), ValueUtility: numberField(candidate, "valueUtility"),
			Selected: candidateID == selectedCandidateID,
		})
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].ValueUtility > candidates[j].ValueUtility })
	if len(candidates) > 3 {
		candidates = candidates[:3]
	}
	return candidates
}

func boolField(value map[string]interface{}, key string) bool {
	if value == nil {
		return false
	}
	result, _ := value[key].(bool)
	return result
}

func mapField(value map[string]interface{}, key string) map[string]interface{} {
	if value == nil {
		return nil
	}
	result, _ := value[key].(map[string]interface{})
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func durationMs(start, end string) int64 {
	if start == "" || end == "" {
		return 0
	}
	started, startErr := time.Parse(time.RFC3339Nano, start)
	completed, endErr := time.Parse(time.RFC3339Nano, end)
	if startErr != nil || endErr != nil || completed.Before(started) {
		return 0
	}
	return completed.Sub(started).Milliseconds()
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit]) + "..."
}
