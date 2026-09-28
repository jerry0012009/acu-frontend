package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

func GetPrivateACUAdvisors(ctx context.Context, userID, limit int) (dto.ACUAdvisorList, error) {
	query := url.Values{}
	query.Set("newapiUserId", strconv.Itoa(userID))
	query.Set("limit", strconv.Itoa(limit))
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-advisors?"+query.Encode(),
		nil,
	)
	if err != nil {
		return dto.ACUAdvisorList{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUAdvisorList{}, fmt.Errorf("ACU Advisor request returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUAdvisorList
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return dto.ACUAdvisorList{}, fmt.Errorf("ACU Advisor response is invalid: %w", err)
	}
	return result, nil
}

func GetPrivateACUMemoryForUser(ctx context.Context, userID int) (dto.ACUPrivateMemory, error) {
	memory, err := GetPrivateACUMemory(ctx, strconv.Itoa(userID))
	if err != nil {
		return dto.ACUPrivateMemory{}, err
	}
	memory.SpaceID = ""
	memory.InternalPrompts = nil
	for skillIndex := range memory.Skills {
		for fileIndex := range memory.Skills[skillIndex].Files {
			memory.Skills[skillIndex].Files[fileIndex].URL = ""
		}
	}
	return memory, nil
}

func GetPrivateACUUserConfig(ctx context.Context, userID int) (dto.ACUPrivateUserConfig, error) {
	query := url.Values{}
	query.Set("newapiUserId", strconv.Itoa(userID))
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/user-config?"+query.Encode(),
		nil,
	)
	if err != nil {
		return dto.ACUPrivateUserConfig{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateUserConfig{}, fmt.Errorf("Private ACU user config request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Config dto.ACUPrivateUserConfig `json:"config"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateUserConfig{}, err
	}
	return envelope.Config, nil
}

func UpdatePrivateACUUserConfig(
	ctx context.Context,
	userID int,
	input dto.ACUPrivateUserConfigRequest,
) (dto.ACUPrivateUserConfig, error) {
	body, err := common.Marshal(map[string]interface{}{
		"newapiUserId":     strconv.Itoa(userID),
		"observerEnabled":  input.ObserverEnabled,
		"advisorEnabled":   input.AdvisorEnabled,
		"injectionEnabled": input.InjectionEnabled,
		"learningEnabled":  input.LearningEnabled,
		"observerInterval": input.ObserverInterval,
	})
	if err != nil {
		return dto.ACUPrivateUserConfig{}, err
	}
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodPut,
		"/internal/admin/private-acu/user-config",
		body,
	)
	if err != nil {
		return dto.ACUPrivateUserConfig{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateUserConfig{}, fmt.Errorf("Private ACU user config save returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Config dto.ACUPrivateUserConfig `json:"config"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateUserConfig{}, err
	}
	return envelope.Config, nil
}

func GetPrivateACULearningRunsForUser(
	ctx context.Context,
	userID int,
) (dto.ACUPrivateLearningRunsSelf, error) {
	query := url.Values{}
	query.Set("newapiUserId", strconv.Itoa(userID))
	query.Set("learningKind", "user_dissatisfaction")
	query.Set("limit", "100")
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/learning-runs?"+query.Encode(),
		nil,
	)
	if err != nil {
		return dto.ACUPrivateLearningRunsSelf{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateLearningRunsSelf{}, fmt.Errorf(
			"Private ACU learning runs request returned HTTP %d",
			response.StatusCode,
		)
	}
	var result dto.ACUPrivateLearningRuns
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return dto.ACUPrivateLearningRunsSelf{}, err
	}
	runs := make([]dto.ACUPrivateLearningRunSelf, 0, len(result.Runs))
	for _, run := range result.Runs {
		runs = append(runs, dto.ACUPrivateLearningRunSelf{
			RunID:                 run.RunID,
			LearningKind:          run.LearningKind,
			Status:                run.Status,
			ElementCount:          run.ElementCount,
			SkillChangeCount:      run.SkillChangeCount,
			PreferenceChangeCount: run.SkillChangeCount,
			ReceivedAt:            run.ReceivedAt,
			CompletedAt:           run.CompletedAt,
		})
	}
	return dto.ACUPrivateLearningRunsSelf{Runs: runs}, nil
}

func GetPrivateACULearningRunDetailForUser(
	ctx context.Context,
	userID int,
	runID string,
) (dto.ACUPrivateLearningRunSelfDetail, error) {
	detail, err := GetPrivateACULearningRunDetail(ctx, runID)
	if err != nil {
		return dto.ACUPrivateLearningRunSelfDetail{}, err
	}
	if detail.NewAPIUserID != strconv.Itoa(userID) {
		return dto.ACUPrivateLearningRunSelfDetail{}, fmt.Errorf("Private ACU learning run not found")
	}

	distillation := map[string]interface{}{}
	for _, key := range []string{"distilled_context", "element_count"} {
		if value, ok := detail.Distillation[key]; ok {
			distillation[key] = value
		}
	}
	return dto.ACUPrivateLearningRunSelfDetail{
		RunID:            detail.RunID,
		LearningKind:     detail.LearningKind,
		Status:           detail.Status,
		ElementCount:     detail.ElementCount,
		SkillChangeCount: detail.SkillChangeCount,
		ReceivedAt:       detail.ReceivedAt,
		CompletedAt:      detail.CompletedAt,
		Distillation:     distillation,
		SkillChanges:     detail.SkillChanges,
	}, nil
}

func GetPrivateACUUsageSummaryForUser(
	ctx context.Context,
	userID int,
) (dto.ACUPrivateUsageSummary, error) {
	usage, err := GetPrivateACUUsage(ctx, strconv.Itoa(userID), 500)
	if err != nil {
		return dto.ACUPrivateUsageSummary{}, err
	}
	now := time.Now()
	windows := []struct {
		name     string
		duration time.Duration
	}{
		{name: "24h", duration: 24 * time.Hour},
		{name: "7d", duration: 7 * 24 * time.Hour},
		{name: "30d", duration: 30 * 24 * time.Hour},
	}
	totalUserCharges := getUserACUCharges(userID, now)
	result := make([]dto.ACUPrivateUsageWindow, 0, len(windows))
	for _, window := range windows {
		cutoff := now.Add(-window.duration)
		calls, charge, byStage, byStageCalls := summarizePrivateACUEntries(usage.Entries, cutoff)
		formattedStages := make(map[string]string, len(byStage))
		for stage, value := range byStage {
			formattedStages[stage] = fmt.Sprintf("%.8f", value)
		}
		var summaryUserChargeCNY string
		var platformChargeCNY string
		var adviceCount int64
		var helpfulAdviceCount int64
		for _, summaryWindow := range usage.Summary.Windows {
			if summaryWindow.Window != window.name {
				continue
			}
			summaryUserChargeCNY = summaryWindow.UserChargeCNY
			platformChargeCNY = summaryWindow.PlatformChargeCNY
			adviceCount = summaryWindow.AdviceCount
			helpfulAdviceCount = summaryWindow.HelpfulAdviceCount
			break
		}
		userChargeCNY := fmt.Sprintf("%.8f", charge)
		if summaryUserChargeCNY != "" {
			userChargeCNY = summaryUserChargeCNY
		}
		result = append(result, dto.ACUPrivateUsageWindow{
			Window:             window.name,
			Calls:              calls,
			UserChargeCNY:      userChargeCNY,
			ByStage:            formattedStages,
			ByStageCalls:       byStageCalls,
			TotalUserChargeCNY: fmt.Sprintf("%.8f", totalUserCharges[window.name]),
			PlatformChargeCNY:  platformChargeCNY,
			AdviceCount:        adviceCount,
			HelpfulAdviceCount: helpfulAdviceCount,
		})
	}
	return dto.ACUPrivateUsageSummary{Windows: result}, nil
}

func summarizePrivateACUEntries(
	entries []dto.ACUPrivateUsageEntry,
	cutoff time.Time,
) (int64, float64, map[string]float64, map[string]int64) {
	calls := int64(0)
	charge := float64(0)
	byStage := map[string]float64{"learning": 0, "observer": 0, "advisor": 0}
	byStageCalls := map[string]int64{"learning": 0, "observer": 0, "advisor": 0}
	for _, entry := range entries {
		createdAt, parseErr := time.Parse(time.RFC3339Nano, entry.CreatedAt)
		if parseErr != nil || createdAt.Before(cutoff) {
			continue
		}
		value, _ := strconv.ParseFloat(entry.UserChargeCNY, 64)
		calls++
		charge += value
		if _, ok := byStage[entry.Stage]; ok {
			byStage[entry.Stage] += value
			if entry.Status == "success" {
				byStageCalls[entry.Stage]++
			}
		}
	}
	return calls, charge, byStage, byStageCalls
}

func getUserACUCharges(userID int, now time.Time) map[string]float64 {
	windows := map[string]time.Duration{
		"24h": 24 * time.Hour,
		"7d":  7 * 24 * time.Hour,
		"30d": 30 * 24 * time.Hour,
	}
	result := make(map[string]float64, len(windows))
	for name, duration := range windows {
		var total string
		err := model.DB.Model(&model.ACUUsageFinalize{}).
			Where(
				"user_id = ? AND status = ? AND created_at >= ?",
				userID,
				model.ACUFinalizeStatusFinalized,
				now.Add(-duration).Unix(),
			).
			Select("COALESCE(SUM(user_charge_cny), 0)").
			Scan(&total).Error
		if err != nil {
			continue
		}
		result[name], _ = strconv.ParseFloat(total, 64)
	}
	return result
}

func UpdatePrivateACUAdvisorFeedback(
	ctx context.Context,
	userID int,
	advisorID string,
	feedback string,
) error {
	body, err := common.Marshal(map[string]interface{}{
		"newapiUserId": strconv.Itoa(userID),
		"feedback":     feedback,
	})
	if err != nil {
		return err
	}
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodPost,
		"/internal/admin/private-advisors/"+url.PathEscape(advisorID)+"/feedback",
		body,
	)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("ACU Advisor feedback request returned HTTP %d", response.StatusCode)
	}
	return nil
}
