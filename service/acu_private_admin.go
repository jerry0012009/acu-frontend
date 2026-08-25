package service

import (
	"context"
	"fmt"
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

func GetPrivateACUMemory(ctx context.Context) (dto.ACUPrivateMemory, error) {
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/memory", nil)
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
