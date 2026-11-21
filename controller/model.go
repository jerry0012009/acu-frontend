package controller

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/relay/channel/ai360"
	"github.com/QuantumNous/new-api/relay/channel/lingyiwanwu"
	"github.com/QuantumNous/new-api/relay/channel/minimax"
	"github.com/QuantumNous/new-api/relay/channel/moonshot"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

// https://platform.openai.com/docs/api-reference/models/list

var openAIModels []dto.OpenAIModels
var openAIModelsMap map[string]dto.OpenAIModels
var channelId2Models map[int][]string

func init() {
	// https://platform.openai.com/docs/models/model-endpoint-compatibility
	for i := 0; i < constant.APITypeDummy; i++ {
		if i == constant.APITypeAIProxyLibrary {
			continue
		}
		adaptor := relay.GetAdaptor(i)
		channelName := adaptor.GetChannelName()
		modelNames := adaptor.GetModelList()
		for _, modelName := range modelNames {
			openAIModels = append(openAIModels, dto.OpenAIModels{
				Id:      modelName,
				Object:  "model",
				Created: 1626777600,
				OwnedBy: channelName,
			})
		}
	}
	for _, modelName := range ai360.ModelList {
		openAIModels = append(openAIModels, dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: ai360.ChannelName,
		})
	}
	for _, modelName := range moonshot.ModelList {
		openAIModels = append(openAIModels, dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: moonshot.ChannelName,
		})
	}
	for _, modelName := range lingyiwanwu.ModelList {
		openAIModels = append(openAIModels, dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: lingyiwanwu.ChannelName,
		})
	}
	for _, modelName := range minimax.ModelList {
		openAIModels = append(openAIModels, dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: minimax.ChannelName,
		})
	}
	for modelName, _ := range constant.MidjourneyModel2Action {
		openAIModels = append(openAIModels, dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "midjourney",
		})
	}
	openAIModelsMap = make(map[string]dto.OpenAIModels)
	for _, aiModel := range openAIModels {
		openAIModelsMap[aiModel.Id] = aiModel
	}
	channelId2Models = make(map[int][]string)
	for i := 1; i <= constant.ChannelTypeDummy; i++ {
		apiType, success := common.ChannelType2APIType(i)
		if !success || apiType == constant.APITypeAIProxyLibrary {
			continue
		}
		meta := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: i,
		}}
		adaptor := relay.GetAdaptor(apiType)
		adaptor.Init(meta)
		channelId2Models[i] = adaptor.GetModelList()
	}
	openAIModels = lo.UniqBy(openAIModels, func(m dto.OpenAIModels) string {
		return m.Id
	})
}

func channelOwnerName(channelType int) string {
	apiType, success := common.ChannelType2APIType(channelType)
	if !success {
		return strings.ToLower(constant.GetChannelTypeName(channelType))
	}
	adaptor := relay.GetAdaptor(apiType)
	if adaptor == nil {
		return strings.ToLower(constant.GetChannelTypeName(channelType))
	}
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelType: channelType,
	}})
	if name := strings.TrimSpace(adaptor.GetChannelName()); name != "" {
		return name
	}
	return strings.ToLower(constant.GetChannelTypeName(channelType))
}

func getPreferredModelOwners(modelNames []string, groups []string) map[string]string {
	channelTypes, err := model.GetPreferredModelOwnerChannelTypes(modelNames, groups)
	if err != nil {
		common.SysLog(fmt.Sprintf("GetPreferredModelOwnerChannelTypes error: %v", err))
		return map[string]string{}
	}

	ownerByChannelType := make(map[int]string)
	owners := make(map[string]string, len(channelTypes))
	for modelName, channelType := range channelTypes {
		owner, ok := ownerByChannelType[channelType]
		if !ok {
			owner = channelOwnerName(channelType)
			ownerByChannelType[channelType] = owner
		}
		if owner != "" {
			owners[modelName] = owner
		}
	}
	return owners
}

func buildOpenAIModel(modelName string, ownerByModel map[string]string) dto.OpenAIModels {
	var oaiModel dto.OpenAIModels
	if staticModel, ok := openAIModelsMap[modelName]; ok {
		oaiModel = staticModel
	} else {
		oaiModel = dto.OpenAIModels{
			Id:      modelName,
			Object:  "model",
			Created: 1626777600,
			OwnedBy: "custom",
		}
	}
	if owner, ok := ownerByModel[modelName]; ok && owner != "" {
		oaiModel.OwnedBy = owner
	}
	oaiModel.SupportedEndpointTypes = model.GetModelSupportEndpointTypes(modelName)
	// Media discovery is consumed by existing Magpie tools; no client-side allowlist needed.
	for _, endpoint := range oaiModel.SupportedEndpointTypes {
		if endpoint == constant.EndpointTypeOpenAIVideo {
			oaiModel.Kind = "video"
			break
		}
		if endpoint == constant.EndpointTypeImageGeneration {
			oaiModel.Kind = "image"
		}
	}
	return oaiModel
}

type modelListGroups struct {
	userGroup   string
	tokenGroup  string
	ownerGroups []string
}

func getModelListGroups(c *gin.Context) (modelListGroups, error) {
	tokenGroup := common.GetContextKeyString(c, constant.ContextKeyTokenGroup)
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if userGroup == "" && (tokenGroup == "" || tokenGroup == "auto") {
		var err error
		userGroup, err = model.GetUserGroup(c.GetInt("id"), false)
		if err != nil {
			return modelListGroups{}, err
		}
	}

	if tokenGroup == "auto" {
		return modelListGroups{
			userGroup:   userGroup,
			tokenGroup:  tokenGroup,
			ownerGroups: service.GetUserAutoGroup(userGroup),
		}, nil
	}

	group := userGroup
	if tokenGroup != "" {
		group = tokenGroup
	}
	return modelListGroups{
		userGroup:   userGroup,
		tokenGroup:  tokenGroup,
		ownerGroups: []string{group},
	}, nil
}

func hasPublicACURouterModel(ownerGroups []string, modelName string) bool {
	for _, group := range ownerGroups {
		for _, requestPath := range []string{
			"/v1/chat/completions",
			"/v1/responses",
			"/v1/messages",
			"/v1/systemone",
			"/v1beta/models/" + modelName + ":generateContent",
			"/v1beta/models/" + modelName + ":streamGenerateContent",
		} {
			if model.HasEnabledChannelTagForGroupModel(
				group, modelName, requestPath, constant.ChannelTagACURouter,
			) {
				return true
			}
		}
	}
	return false
}

func filterPublicACUModelsByProfileVisibility(
	ctx context.Context,
	modelNames []string,
	ownerGroups []string,
) ([]string, map[string]map[string]bool) {
	hasPublicACUModel := false
	for _, modelName := range modelNames {
		if hasPublicACURouterModel(ownerGroups, modelName) {
			hasPublicACUModel = true
			break
		}
	}
	if !hasPublicACUModel {
		return modelNames, nil
	}

	profilePayload, err := service.GetACUExecutionProfiles(ctx)
	visibleModels := make(map[string]struct{})
	protocolsByModel := make(map[string]map[string]bool)
	if err != nil {
		common.SysError("failed to load ACU execution profiles for model discovery: " + err.Error())
	} else if profiles, ok := profilePayload["profiles"].([]interface{}); ok {
		for _, item := range profiles {
			profile, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			// Database profiles expose routingEnabled. Only legacy payloads
			// fall back to enabled; an explicit false always takes precedence.
			enabled, hasRoutingEnabled := profile["routingEnabled"].(bool)
			if !hasRoutingEnabled {
				enabled = profile["enabled"] == true
			}
			if !enabled || profile["administratorAllowed"] == false {
				continue
			}
			modelID, _ := profile["modelId"].(string)
			if modelID != "" {
				if protocols, current := profile["executableProtocols"].([]interface{}); current {
					if len(protocols) == 0 {
						continue
					}
					if protocolsByModel[modelID] == nil {
						protocolsByModel[modelID] = make(map[string]bool)
					}
					for _, protocol := range protocols {
						if name, ok := protocol.(string); ok {
							protocolsByModel[modelID][name] = true
						}
					}
				}
				visibleModels[modelID] = struct{}{}
			}
		}
	} else {
		common.SysError("ACU execution profile response did not include a profiles list")
	}

	filtered := make([]string, 0, len(modelNames))
	for _, modelName := range modelNames {
		if modelName == "acu-auto" {
			filtered = append(filtered, modelName)
			continue
		}
		if hasPublicACURouterModel(ownerGroups, modelName) {
			if _, visible := visibleModels[modelName]; !visible {
				continue
			}
		}
		filtered = append(filtered, modelName)
	}
	return filtered, protocolsByModel
}

func discoverableModels(c *gin.Context, ownerGroups []string, candidates []string) ([]string, map[string]map[string]bool) {
	acceptUnsetRatioModel := operation_setting.SelfUseModeEnabled
	if !acceptUnsetRatioModel {
		userId := c.GetInt("id")
		if userId > 0 {
			userSettings, _ := model.GetUserSetting(userId, false)
			if userSettings.AcceptUnsetRatioModel {
				acceptUnsetRatioModel = true
			}
		}
	}

	userModelNames := make([]string, 0, len(candidates))
	modelLimitEnable := common.GetContextKeyBool(c, constant.ContextKeyTokenModelLimitEnabled)
	s, _ := common.GetContextKey(c, constant.ContextKeyTokenModelLimit)
	tokenModelLimit, _ := s.(map[string]bool)
	for _, modelName := range candidates {
		if _, allowed := tokenModelLimit[modelName]; modelLimitEnable && !allowed {
			continue
		}
		if hasPublicACURouterModel(ownerGroups, modelName) {
			if !service.IsACUGlobalModelExposed(modelName) {
				continue
			}
		} else if !acceptUnsetRatioModel && !helper.HasModelBillingConfig(modelName) {
			continue
		}
		userModelNames = append(userModelNames, modelName)
	}
	return filterPublicACUModelsByProfileVisibility(c.Request.Context(), userModelNames, ownerGroups)
}

func discoveryModelEntry(modelName string, ownerByModel map[string]string, ownerGroups []string, protocols map[string]bool) dto.OpenAIModels {
	entry := buildOpenAIModel(modelName, ownerByModel)
	if !hasPublicACURouterModel(ownerGroups, modelName) {
		return entry
	}
	if protocols != nil {
		entry.SupportedEndpointTypes = nil
	}
	for _, endpoint := range []struct {
		protocol string
		kind     constant.EndpointType
		paths    []string
	}{
		{"chat_completions", constant.EndpointTypeOpenAI, []string{"/v1/chat/completions"}},
		{"responses", constant.EndpointTypeOpenAIResponse, []string{"/v1/responses"}},
		{"messages", constant.EndpointTypeAnthropic, []string{"/v1/messages"}},
		{"gemini", constant.EndpointTypeGemini, []string{"/v1beta/models/" + modelName + ":generateContent", "/v1beta/models/" + modelName + ":streamGenerateContent"}},
		{"systemone", constant.EndpointTypeSystemOne, []string{"/v1/systemone"}},
	} {
		if protocols != nil && !protocols[endpoint.protocol] {
			continue
		}
		for _, path := range endpoint.paths {
			if slices.ContainsFunc(ownerGroups, func(group string) bool {
				return model.HasEnabledChannelTagForGroupModel(group, modelName, path, constant.ChannelTagACURouter)
			}) {
				entry.SupportedEndpoints = append(entry.SupportedEndpoints, path)
				if protocols != nil && !slices.Contains(entry.SupportedEndpointTypes, endpoint.kind) {
					entry.SupportedEndpointTypes = append(entry.SupportedEndpointTypes, endpoint.kind)
				}
			}
		}
	}
	return entry
}

func ListModels(c *gin.Context, modelType int) {
	groups, err := getModelListGroups(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "get user group failed"})
		return
	}
	ownerGroups := groups.ownerGroups
	userModelNames, protocolsByModel := discoverableModels(c, ownerGroups, service.GetGroupsEnabledModels(ownerGroups))

	ownerByModel := map[string]string{}
	if len(ownerGroups) > 0 {
		ownerByModel = getPreferredModelOwners(userModelNames, ownerGroups)
	}
	userOpenAiModels := make([]dto.OpenAIModels, 0, len(userModelNames))
	for _, modelName := range userModelNames {
		userOpenAiModels = append(userOpenAiModels, discoveryModelEntry(modelName, ownerByModel, ownerGroups, protocolsByModel[modelName]))
	}

	switch modelType {
	case constant.ChannelTypeAnthropic:
		useranthropicModels := make([]dto.AnthropicModel, len(userOpenAiModels))
		for i, model := range userOpenAiModels {
			useranthropicModels[i] = dto.AnthropicModel{
				ID:          model.Id,
				CreatedAt:   time.Unix(int64(model.Created), 0).UTC().Format(time.RFC3339),
				DisplayName: model.Id,
				Type:        "model",
			}
		}
		firstID, lastID := "", ""
		if len(useranthropicModels) > 0 {
			firstID, lastID = useranthropicModels[0].ID, useranthropicModels[len(useranthropicModels)-1].ID
		}
		c.JSON(200, gin.H{
			"data":     useranthropicModels,
			"first_id": firstID,
			"has_more": false,
			"last_id":  lastID,
		})
	case constant.ChannelTypeGemini:
		userGeminiModels := make([]dto.GeminiModel, len(userOpenAiModels))
		for i, model := range userOpenAiModels {
			userGeminiModels[i] = dto.GeminiModel{
				Name:        model.Id,
				DisplayName: model.Id,
			}
		}
		c.JSON(200, gin.H{
			"models":        userGeminiModels,
			"nextPageToken": nil,
		})
	default:
		c.JSON(200, gin.H{
			"success": true,
			"data":    userOpenAiModels,
			"object":  "list",
		})
	}
}

func ChannelListModels(c *gin.Context) {
	c.JSON(200, gin.H{
		"success": true,
		"data":    openAIModels,
	})
}

func DashboardListModels(c *gin.Context) {
	c.JSON(200, gin.H{
		"success": true,
		"data":    channelId2Models,
	})
}

func EnabledListModels(c *gin.Context) {
	c.JSON(200, gin.H{
		"success": true,
		"data":    model.GetEnabledModels(),
	})
}

func RetrieveModel(c *gin.Context, modelType int) {
	modelId := c.Param("model")
	groups, err := getModelListGroups(c)
	var names []string
	var protocols map[string]map[string]bool
	if err == nil && slices.Contains(service.GetGroupsEnabledModels(groups.ownerGroups), modelId) {
		names, protocols = discoverableModels(c, groups.ownerGroups, []string{modelId})
	}
	if len(names) != 0 {
		aiModel := discoveryModelEntry(modelId, getPreferredModelOwners(names, groups.ownerGroups), groups.ownerGroups, protocols[modelId])
		switch modelType {
		case constant.ChannelTypeAnthropic:
			c.JSON(200, dto.AnthropicModel{
				ID:          aiModel.Id,
				CreatedAt:   time.Unix(int64(aiModel.Created), 0).UTC().Format(time.RFC3339),
				DisplayName: aiModel.Id,
				Type:        "model",
			})
		default:
			c.JSON(200, aiModel)
		}
	} else {
		openAIError := types.OpenAIError{
			Message: fmt.Sprintf("The model '%s' does not exist", modelId),
			Type:    "invalid_request_error",
			Param:   "model",
			Code:    "model_not_found",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
	}
}
