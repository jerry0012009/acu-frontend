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

func GetPrivateACUPreferenceProfile(ctx context.Context, userID int) (dto.ACUPreferenceProfileView, error) {
	if userID <= 0 {
		return dto.ACUPreferenceProfileView{}, fmt.Errorf("authenticated user is required")
	}
	query := url.Values{"newapiUserId": {strconv.Itoa(userID)}}
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/preference-profile?"+query.Encode(), nil)
	if err != nil {
		return dto.ACUPreferenceProfileView{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUPreferenceProfileView{}, fmt.Errorf("preference profile returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Profile dto.ACUPreferenceProfileView `json:"profile"`
	}
	if err := common.DecodeJson(response.Body, &envelope); err != nil {
		return dto.ACUPreferenceProfileView{}, err
	}
	return envelope.Profile, nil
}
