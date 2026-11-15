package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

const acuPrivatePOCAccessOption = "ACUPrivatePOCAccess"

func GetPrivateACUPOCAccess() (dto.ACUPrivatePOCAccess, error) {
	common.OptionMapRWMutex.RLock()
	raw := strings.TrimSpace(common.OptionMap[acuPrivatePOCAccessOption])
	common.OptionMapRWMutex.RUnlock()
	if raw == "" {
		return dto.ACUPrivatePOCAccess{Spaces: []dto.ACUPrivatePOCSpaceAccess{}}, nil
	}
	var result dto.ACUPrivatePOCAccess
	if err := common.UnmarshalJsonStr(raw, &result); err != nil {
		return dto.ACUPrivatePOCAccess{}, fmt.Errorf("invalid %s: %w", acuPrivatePOCAccessOption, err)
	}
	if result.Spaces == nil {
		result.Spaces = []dto.ACUPrivatePOCSpaceAccess{}
	}
	for index := range result.Spaces {
		result.Spaces[index].Key = strings.TrimSpace(result.Spaces[index].Key)
		result.Spaces[index].SpaceID = strings.TrimSpace(result.Spaces[index].SpaceID)
		sort.Ints(result.Spaces[index].MemberUserIDs)
	}
	return result, nil
}

func SavePrivateACUPOCAccess(input dto.ACUPrivatePOCAccess) error {
	if len(input.Spaces) > 100 {
		return fmt.Errorf("too many Private ACU POC spaces")
	}
	seenKeys := make(map[string]struct{}, len(input.Spaces))
	seenSpaceIDs := make(map[string]struct{}, len(input.Spaces))
	for index := range input.Spaces {
		space := &input.Spaces[index]
		space.Key = strings.TrimSpace(space.Key)
		space.SpaceID = strings.TrimSpace(space.SpaceID)
		if space.Key == "" || space.SpaceID == "" {
			return fmt.Errorf("POC space key and spaceId are required")
		}
		if _, exists := seenKeys[space.Key]; exists {
			return fmt.Errorf("duplicate POC space key: %s", space.Key)
		}
		if _, exists := seenSpaceIDs[space.SpaceID]; exists {
			return fmt.Errorf("duplicate POC spaceId: %s", space.SpaceID)
		}
		seenKeys[space.Key] = struct{}{}
		seenSpaceIDs[space.SpaceID] = struct{}{}
		if len(space.MemberUserIDs) > 10_000 {
			return fmt.Errorf("too many members in POC space %s", space.Key)
		}
		for _, writer := range space.WriterUserIDs {
			if writer <= 0 || !containsUserID(space.MemberUserIDs, writer) {
				return fmt.Errorf("team writers must be members")
			}
		}
		sort.Ints(space.MemberUserIDs)
	}
	payload, err := common.Marshal(input)
	if err != nil {
		return err
	}
	return model.UpdateOption(acuPrivatePOCAccessOption, string(payload))
}

type ACULearningTeamContext struct {
	SpaceID  string `json:"spaceId"`
	Team     string `json:"team"`
	CanWrite bool   `json:"canWrite"`
}

func ResolveACULearningTeam(userID, tokenID int) (*ACULearningTeamContext, error) {
	if userID <= 0 || tokenID <= 0 {
		return nil, fmt.Errorf("authenticated Key required")
	}
	var token model.Token
	if err := model.DB.Where("id = ? AND user_id = ? AND status = ?", tokenID, userID, 1).First(&token).Error; err != nil {
		return nil, fmt.Errorf("Key unavailable")
	}
	if token.ExpiredTime > 0 && token.ExpiredTime <= time.Now().Unix() {
		return nil, fmt.Errorf("Key expired")
	}
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		return nil, fmt.Errorf("Key quota unavailable")
	}
	access, err := GetPrivateACUPOCAccess()
	if err != nil {
		return nil, err
	}
	var result *ACULearningTeamContext
	for _, space := range access.Spaces {
		if !space.Enabled || space.Key != "GYZ" || !containsUserID(space.MemberUserIDs, userID) {
			continue
		}
		if result != nil {
			return nil, fmt.Errorf("ambiguous team membership")
		}
		result = &ACULearningTeamContext{SpaceID: space.SpaceID, Team: space.Key, CanWrite: containsUserID(space.WriterUserIDs, userID)}
	}
	return result, nil
}

func GetPrivateACUFilmMemberView(ctx context.Context, userID int) (dto.ACUPrivateFilmMemberView, error) {
	access, err := GetPrivateACUPOCAccess()
	if err != nil {
		return dto.ACUPrivateFilmMemberView{}, err
	}
	status, err := GetPrivateACUFilmStatus(ctx)
	if err != nil {
		return dto.ACUPrivateFilmMemberView{}, err
	}
	result := dto.ACUPrivateFilmMemberView{
		Enabled: status.Enabled,
		Spaces:  []dto.ACUPrivateFilmMemberSpace{},
	}
	if !status.Enabled {
		return result, nil
	}
	for _, space := range access.Spaces {
		if !space.Enabled || space.SpaceID != status.SpaceID || !containsUserID(space.MemberUserIDs, userID) {
			continue
		}
		result.Spaces = append(result.Spaces, dto.ACUPrivateFilmMemberSpace{
			Key:       space.Key,
			TeamScope: status.TeamScope,
			Skills:    status.Skills,
		})
	}
	return result, nil
}

func containsUserID(userIDs []int, userID int) bool {
	for _, candidate := range userIDs {
		if candidate == userID {
			return true
		}
	}
	return false
}
