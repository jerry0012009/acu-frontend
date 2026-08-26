package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
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
