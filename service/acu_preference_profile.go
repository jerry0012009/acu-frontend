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

// Team data stays in its learning space; membership is checked on every read.
func GetPrivateACUTeamPreferences(ctx context.Context, userID int) (dto.ACUTeamPreferenceView, error) {
	result := dto.ACUTeamPreferenceView{Version: 1, Spaces: []dto.ACUTeamPreferenceSpace{}}
	if userID <= 0 {
		return result, fmt.Errorf("authenticated user is required")
	}
	access, err := GetPrivateACUPOCAccess()
	if err != nil {
		return result, err
	}
	for _, space := range access.Spaces {
		if !space.Enabled || !containsUserID(space.MemberUserIDs, userID) {
			continue
		}
		status, err := GetPrivateACUFilmStatus(ctx)
		if err != nil {
			return result, err
		}
		if !status.Enabled || status.SpaceID != space.SpaceID {
			continue
		}
		query := url.Values{"spaceId": {space.SpaceID}}
		response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/private-acu/team-preference-profile?"+query.Encode(), nil)
		if err != nil {
			return result, err
		}
		var envelope struct {
			Profile dto.ACUPreferenceProfileView `json:"profile"`
		}
		decodeErr := common.DecodeJson(response.Body, &envelope)
		response.Body.Close()
		if response.StatusCode != http.StatusOK || decodeErr != nil {
			return result, fmt.Errorf("team profile unavailable")
		}
		records := []dto.ACUPreferenceRecord{}
		for _, skill := range status.Skills {
			if summary := preferenceRecordText(skill.Description); summary != "" {
				records = append(records, dto.ACUPreferenceRecord{ID: skill.ID, Summary: summary})
			}
		}
		result.Spaces = append(result.Spaces, dto.ACUTeamPreferenceSpace{Key: space.Key, View: envelope.Profile, Records: records})
	}
	return result, nil
}
