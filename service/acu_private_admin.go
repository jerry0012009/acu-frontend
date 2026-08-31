package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func GetPrivateACUPrompts(ctx context.Context) (dto.ACUPrivatePrompts, error) {
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/prompts", nil)
	if err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivatePrompts{}, fmt.Errorf("Private ACU prompt request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Prompts dto.ACUPrivatePrompts `json:"prompts"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	return envelope.Prompts, nil
}

func SavePrivateACUPrompts(
	ctx context.Context,
	input dto.ACUPrivatePromptsRequest,
	updatedBy string,
) (dto.ACUPrivatePrompts, error) {
	body, err := common.Marshal(map[string]interface{}{
		"observerPrompt": input.ObserverPrompt,
		"advisorPrompt":  input.AdvisorPrompt,
		"learningPrompt": input.LearningPrompt,
		"enabled":        input.Enabled == nil || *input.Enabled,
		"updatedBy":      updatedBy,
	})
	if err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodPut, "/internal/admin/private-acu/prompts", body)
	if err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivatePrompts{}, fmt.Errorf("Private ACU prompt save returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Prompts dto.ACUPrivatePrompts `json:"prompts"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	return envelope.Prompts, nil
}

func ResetPrivateACUPrompts(ctx context.Context, updatedBy string) (dto.ACUPrivatePrompts, error) {
	body, err := common.Marshal(map[string]string{"updatedBy": updatedBy})
	if err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodPost, "/internal/admin/private-acu/prompts/reset", body)
	if err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivatePrompts{}, fmt.Errorf("Private ACU prompt reset returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Prompts dto.ACUPrivatePrompts `json:"prompts"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivatePrompts{}, err
	}
	return envelope.Prompts, nil
}

func GetPrivateACUMemory(ctx context.Context, userID string) (dto.ACUPrivateMemory, error) {
	query := url.Values{}
	if strings.TrimSpace(userID) != "" {
		query.Set("newapiUserId", strings.TrimSpace(userID))
	}
	path := "/internal/admin/private-acu/memory"
	if len(query) > 0 {
		path += "?" + query.Encode()
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return dto.ACUPrivateMemory{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateMemory{}, fmt.Errorf("Private ACU memory request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Memory dto.ACUPrivateMemory `json:"memory"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateMemory{}, err
	}
	return envelope.Memory, nil
}

func GetPrivateACUFilmStatus(ctx context.Context) (dto.ACUPrivateFilmStatus, error) {
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/film", nil)
	if err != nil {
		return dto.ACUPrivateFilmStatus{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateFilmStatus{}, fmt.Errorf("Private ACU film status request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Film dto.ACUPrivateFilmStatus `json:"film"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateFilmStatus{}, err
	}
	return envelope.Film, nil
}

func GetPrivateACUUsage(ctx context.Context, userID string, limit int) (dto.ACUPrivateUsage, error) {
	query := url.Values{}
	query.Set("newapiUserId", strings.TrimSpace(userID))
	query.Set("limit", strconv.Itoa(limit))
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/usage?"+query.Encode(), nil)
	if err != nil {
		return dto.ACUPrivateUsage{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateUsage{}, fmt.Errorf("Private ACU usage request returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUPrivateUsage
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return dto.ACUPrivateUsage{}, err
	}
	return result, nil
}

func GetPrivateACUExperiences(ctx context.Context, userID string, limit int) (dto.ACUPrivateExperiences, error) {
	query := url.Values{}
	query.Set("newapiUserId", strings.TrimSpace(userID))
	query.Set("limit", strconv.Itoa(limit))
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/experiences?"+query.Encode(), nil)
	if err != nil {
		return dto.ACUPrivateExperiences{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateExperiences{}, fmt.Errorf("Private ACU experiences request returned HTTP %d", response.StatusCode)
	}
	var envelope dto.ACUPrivateExperiences
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateExperiences{}, err
	}
	return envelope, nil
}

func GetPrivateACUExperienceDetail(
	ctx context.Context,
	userID string,
	experienceID string,
) (dto.ACUPrivateExperienceDetail, error) {
	query := url.Values{}
	query.Set("newapiUserId", strings.TrimSpace(userID))
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/experiences/"+url.PathEscape(experienceID)+"?"+query.Encode(),
		nil,
	)
	if err != nil {
		return dto.ACUPrivateExperienceDetail{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateExperienceDetail{}, fmt.Errorf("Private ACU experience detail request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Experience dto.ACUPrivateExperienceDetail `json:"experience"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateExperienceDetail{}, err
	}
	return envelope.Experience, nil
}

func GetPrivateACULearningRuns(
	ctx context.Context,
	limit int,
	learningKind string,
) (dto.ACUPrivateLearningRuns, error) {
	query := url.Values{}
	query.Set("limit", strconv.Itoa(limit))
	if strings.TrimSpace(learningKind) != "" {
		query.Set("learningKind", strings.TrimSpace(learningKind))
	}
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/learning-runs?"+query.Encode(),
		nil,
	)
	if err != nil {
		return dto.ACUPrivateLearningRuns{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateLearningRuns{}, fmt.Errorf("Private ACU learning runs request returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUPrivateLearningRuns
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return dto.ACUPrivateLearningRuns{}, err
	}
	return result, nil
}

func GetPrivateACULearningRunDetail(
	ctx context.Context,
	runID string,
) (dto.ACUPrivateLearningRunDetail, error) {
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/learning-runs/"+url.PathEscape(runID),
		nil,
	)
	if err != nil {
		return dto.ACUPrivateLearningRunDetail{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPrivateLearningRunDetail{}, fmt.Errorf("Private ACU learning run detail request returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Run dto.ACUPrivateLearningRunDetail `json:"run"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPrivateLearningRunDetail{}, err
	}
	return envelope.Run, nil
}

func GetPrivateACULearningRunMedia(
	ctx context.Context,
	runID string,
	mediaID string,
) ([]byte, string, string, error) {
	response, err := acuRouterAdminRequest(
		ctx,
		http.MethodGet,
		"/internal/admin/private-acu/learning-runs/"+url.PathEscape(runID)+"/media/"+url.PathEscape(mediaID),
		nil,
	)
	if err != nil {
		return nil, "", "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", "", fmt.Errorf("Private ACU learning run media request returned HTTP %d", response.StatusCode)
	}
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, "", "", err
	}
	return content, response.Header.Get("Content-Type"), response.Header.Get("Content-Disposition"), nil
}

func GetPrivateACUAdvisorsByUserID(ctx context.Context, userID string, limit int) (dto.ACUAdvisorList, error) {
	query := url.Values{}
	query.Set("newapiUserId", strings.TrimSpace(userID))
	query.Set("limit", strconv.Itoa(limit))
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-advisors?"+query.Encode(), nil)
	if err != nil {
		return dto.ACUAdvisorList{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUAdvisorList{}, fmt.Errorf("Private ACU advisor request returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUAdvisorList
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return dto.ACUAdvisorList{}, err
	}
	return result, nil
}
