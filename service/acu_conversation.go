package service

import (
	"context"
	"errors"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

var acuConversationImageModels = []string{
	"gpt-image-2.5-flare",
	"gpt-image-2.5-sunburst",
	"gpt-image-2",
}

func IsACUConversationTokenEligible(token *model.Token, now int64) bool {
	if token == nil || token.Status != common.TokenStatusEnabled {
		return false
	}
	if token.ExpiredTime != -1 && token.ExpiredTime <= now {
		return false
	}
	if !token.UnlimitedQuota && token.RemainQuota <= 0 {
		return false
	}
	return true
}

func SelectACUConversationToken(tokens []*model.Token, now int64) (*model.Token, error) {
	for _, token := range tokens {
		if IsACUConversationTokenEligible(token, now) {
			return token, nil
		}
	}
	return nil, errors.New("ACU Conversation requires an enabled API key with available quota")
}

func GetACUConversationModels(ctx context.Context, token *model.Token, userGroup string) ([]string, error) {
	profiles, err := globalACUProfileConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	policy, err := ResolveACUEffectiveRoutingPolicy(token)
	if err != nil {
		return nil, err
	}

	allowedModels := make(map[string]struct{}, len(policy.AllowedModelIDs))
	for _, modelID := range policy.AllowedModelIDs {
		allowedModels[modelID] = struct{}{}
	}
	allowedProfiles := make(map[string]struct{}, len(policy.AllowedProfileIDs))
	for _, profileID := range policy.AllowedProfileIDs {
		allowedProfiles[profileID] = struct{}{}
	}

	effectiveGroup := token.Group
	if effectiveGroup == "" {
		effectiveGroup = userGroup
	}
	groups := []string{effectiveGroup}
	if effectiveGroup == "auto" {
		groups = GetUserAutoGroup(userGroup)
	}

	models := make([]string, 0, len(profiles)+2)
	seen := make(map[string]bool)
	for _, profile := range profiles {
		modelID := strings.TrimSpace(profile.ModelID)
		if modelID == "" || len(profile.Protocols) == 0 || seen[modelID] {
			continue
		}
		if len(allowedProfiles) > 0 {
			if _, ok := allowedProfiles[profile.ExecutionProfileID]; !ok {
				continue
			}
		}
		if !tokenAllowsACUConversationModel(token, modelID) {
			continue
		}
		if policy.RoutingPolicy == ACURoutingPolicyCustom {
			if _, ok := allowedModels[modelID]; !ok {
				if policy.ModelAccess[modelID] != ACUModelAccessExplicit {
					continue
				}
			}
		}
		if !hasACUConversationAbility(groups, modelID) {
			continue
		}
		models = append(models, modelID)
		seen[modelID] = true
	}

	for _, virtualModel := range []string{"acu-auto", "acu-high"} {
		if !seen[virtualModel] && tokenAllowsACUConversationModel(token, virtualModel) &&
			hasACUConversationAbility(groups, virtualModel) {
			models = append(models, virtualModel)
			seen[virtualModel] = true
		}
	}
	for _, imageModel := range acuConversationImageModels {
		if !seen[imageModel] && tokenAllowsACUConversationModel(token, imageModel) &&
			hasACUConversationImageAbility(groups, imageModel) {
			models = append(models, imageModel)
			seen[imageModel] = true
		}
	}
	sort.Strings(models)
	return models, nil
}

func tokenAllowsACUConversationModel(token *model.Token, modelID string) bool {
	if !token.ModelLimitsEnabled {
		return true
	}
	limits := token.GetModelLimitsMap()
	if modelID == "acu-auto" || modelID == "acu-high" {
		return true
	}
	_, ok := limits[ratio_setting.FormatMatchingModelName(modelID)]
	return ok
}

func supportsACUConversationResponses(protocols []string) bool {
	for _, protocol := range protocols {
		if strings.EqualFold(strings.TrimSpace(protocol), "responses") {
			return true
		}
	}
	return false
}

func hasACUConversationAbility(groups []string, modelID string) bool {
	for _, group := range groups {
		if model.HasEnabledChannelTagForGroupModel(
			group, modelID, "/pg/chat/completions", constant.ChannelTagACURouter,
		) {
			return true
		}
	}
	return false
}

func hasACUConversationImageAbility(groups []string, modelID string) bool {
	for _, group := range groups {
		if model.HasEnabledChannelForGroupModel(
			group, modelID, "/v1/images/generations",
		) {
			return true
		}
	}
	return false
}
