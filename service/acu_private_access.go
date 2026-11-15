package service

import (
	"context"
	"fmt"
	"regexp"
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
	boundTokens := map[int]bool{}
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
		if len(space.Projects) > 100 {
			return fmt.Errorf("too many learning projects")
		}
		projectIDs := map[string]bool{}
		for _, project := range space.Projects {
			if !regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`).MatchString(project.ID) || len(project.Name) == 0 || len(project.Name) > 240 || projectIDs[project.ID] || len(project.TokenIDs) > 1000 {
				return fmt.Errorf("invalid learning project")
			}
			projectIDs[project.ID] = true
			for _, tokenID := range project.TokenIDs {
				if tokenID <= 0 || boundTokens[tokenID] {
					return fmt.Errorf("a Key may belong to only one project")
				}
				boundTokens[tokenID] = true
				var token model.Token
				if err := model.DB.Where("id = ?", tokenID).First(&token).Error; err != nil || !containsUserID(space.MemberUserIDs, token.UserId) {
					return fmt.Errorf("project Key owner must be a team member")
				}
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

type ACULearningProjectContext struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	SpaceID  string `json:"spaceId"`
	Team     string `json:"team"`
	CanWrite bool   `json:"canWrite"`
}

func ResolveACULearningProject(userID, tokenID int, requestedProject string) (*ACULearningProjectContext, error) {
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
	var result *ACULearningProjectContext
	for _, space := range access.Spaces {
		for _, project := range space.Projects {
			if !containsUserID(project.TokenIDs, tokenID) {
				continue
			}
			if requestedProject != "" && requestedProject != project.ID {
				return nil, fmt.Errorf("project does not match Key binding")
			}
			if result != nil {
				return nil, fmt.Errorf("ambiguous project binding")
			}
			result = &ACULearningProjectContext{ID: project.ID, Name: project.Name, SpaceID: space.SpaceID, Team: space.Key, CanWrite: space.Enabled && project.Enabled && containsUserID(space.MemberUserIDs, userID) && containsUserID(space.WriterUserIDs, userID)}
		}
	}
	if requestedProject != "" && result == nil {
		return nil, fmt.Errorf("project not bound to Key")
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
