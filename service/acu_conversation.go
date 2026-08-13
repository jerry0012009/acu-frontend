package service

import (
	"context"
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func IsACUConversationTokenEligible(token *model.Token, now int64) bool {
	if token == nil || token.Status != common.TokenStatusEnabled {
		return false
	}
	if token.ExpiredTime != -1 && token.ExpiredTime <= now {
		return false
	}
	if !token.UnlimitedQuota && token.RemainQuota < max(1, common.PreConsumedQuota) {
		return false
	}
	if !token.ACUProfileLimitsEnabled {
		return true
	}
	for _, profileID := range token.ACUProfileLimits {
		if strings.HasSuffix(strings.ToLower(strings.TrimSpace(profileID)), ":responses") {
			return true
		}
	}
	return false
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
	catalog, err := GetACURoutingCatalog(ctx)
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

	models := make([]string, 0, len(catalog.Models)+2)
	for _, catalogModel := range catalog.Models {
		modelID := strings.TrimSpace(catalogModel.ModelID)
		if modelID == "" || !catalogModel.AutoRouteEnabled ||
			!supportsACUConversationResponses(catalogModel.Protocols) {
			continue
		}
		if !tokenAllowsACUConversationModel(token, modelID) {
			continue
		}
		if policy.RoutingPolicy == ACURoutingPolicyCustom {
			if _, ok := allowedModels[modelID]; !ok {
				continue
			}
		}
		if !tokenAllowsACUConversationProfile(modelID, catalog.Profiles, allowedProfiles) ||
			!hasACUConversationAbility(groups, modelID) {
			continue
		}
		models = append(models, modelID)
	}

	for _, virtualModel := range []string{"acu-auto", "acu-high"} {
		if tokenAllowsACUConversationModel(token, virtualModel) &&
			hasACUConversationAbility(groups, virtualModel) {
			models = append(models, virtualModel)
		}
	}
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

func tokenAllowsACUConversationProfile(modelID string, profiles []dto.ACURoutingCatalogProfile, allowedProfiles map[string]struct{}) bool {
	if len(allowedProfiles) == 0 {
		return true
	}
	for _, profile := range profiles {
		if profile.CanonicalModel != modelID ||
			!supportsACUConversationResponses(profile.Protocol) {
			continue
		}
		if _, ok := allowedProfiles[profile.ExecutionProfileID]; ok {
			return true
		}
	}
	return false
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
