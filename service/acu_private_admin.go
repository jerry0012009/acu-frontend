package service

import (
	"context"
	"fmt"
	"net/http"

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
	body, err := common.Marshal(map[string]string{
		"observerPrompt": input.ObserverPrompt,
		"advisorPrompt":  input.AdvisorPrompt,
		"learningPrompt": input.LearningPrompt,
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
