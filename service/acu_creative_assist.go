package service

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type CreativeAssistRequest struct {
	Prompt  string `json:"prompt"`
	Mode    string `json:"mode"`
	Context string `json:"context,omitempty"`
}

type CreativeAssistResult struct {
	Status       string                `json:"status"`
	Prompt       string                `json:"prompt"`
	Supplement   string                `json:"supplement"`
	Fingerprint  string                `json:"fingerprint"`
	Presentation *CreativePresentation `json:"presentation,omitempty"`
	References   []struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Quote string `json:"quote"`
	} `json:"references"`
}

type CreativePresentation struct {
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Basis   string `json:"basis"`
}

func AssistCreativeRequest(ctx context.Context, userID, tokenID int, requestID string, input CreativeAssistRequest) (CreativeAssistResult, error) {
	if userID <= 0 || len(input.Prompt) == 0 || len(input.Prompt) > 96000 || len(input.Context) > 180000 || (input.Mode != "generate" && input.Mode != "review") {
		return CreativeAssistResult{}, fmt.Errorf("invalid creative request")
	}
	// Scope is determined here from the authenticated account, never client input.
	account, err := model.GetUserCache(userID)
	if err != nil {
		return CreativeAssistResult{}, err
	}
	if account.Quota <= 0 {
		return CreativeAssistResult{}, fmt.Errorf("insufficient balance for creative assistance")
	}
	allowed := false
	filmSpaceID := ""
	access, err := GetPrivateACUPOCAccess()
	if err != nil {
		return CreativeAssistResult{}, err
	}
	for _, space := range access.Spaces {
		if space.Enabled && space.Key == "GYZ" && containsUserID(space.MemberUserIDs, userID) {
			allowed = true
			filmSpaceID = space.SpaceID
		}
	}
	body, err := common.Marshal(map[string]any{
		"userId": strconv.Itoa(userID), "tokenId": strconv.Itoa(tokenID), "requestId": requestID,
		"prompt": input.Prompt, "context": input.Context, "mode": input.Mode, "filmAllowed": allowed, "filmSpaceId": filmSpaceID,
	})
	if err != nil {
		return CreativeAssistResult{}, err
	}
	bounded, cancel := context.WithTimeout(ctx, 47*time.Second)
	defer cancel()
	response, err := acuRouterAdminRequestWithTimeout(bounded, 47*time.Second, http.MethodPost, "/internal/admin/private-acu/creative-assist", body)
	if err != nil {
		return CreativeAssistResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return CreativeAssistResult{}, fmt.Errorf("creative assist HTTP %d", response.StatusCode)
	}
	var result CreativeAssistResult
	if err = common.DecodeJson(response.Body, &result); err != nil {
		return result, err
	}
	if result.Status != "disabled" && result.Status != "no_match" && result.Status != "ready" {
		return result, fmt.Errorf("invalid creative status")
	}
	if result.Prompt == "" || len(result.Prompt) > 110000 {
		return result, fmt.Errorf("invalid effective prompt")
	}
	return result, nil
}
