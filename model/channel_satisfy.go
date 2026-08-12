package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func IsChannelEnabledForGroupModel(group string, modelName string, channelID int) bool {
	if group == "" || modelName == "" || channelID <= 0 {
		return false
	}
	if !common.MemoryCacheEnabled {
		return isChannelEnabledForGroupModelDB(group, modelName, channelID)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil {
		return false
	}

	if isChannelIDInList(group2model2channels[group][modelName], channelID) {
		return true
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized != "" && normalized != modelName {
		return isChannelIDInList(group2model2channels[group][normalized], channelID)
	}
	return false
}

func IsChannelEnabledForAnyGroupModel(groups []string, modelName string, channelID int) bool {
	if len(groups) == 0 {
		return false
	}
	for _, g := range groups {
		if IsChannelEnabledForGroupModel(g, modelName, channelID) {
			return true
		}
	}
	return false
}

func HasEnabledChannelTagForGroupModel(group string, modelName string, requestPath string, tag string) bool {
	if group == "" || modelName == "" || strings.TrimSpace(tag) == "" {
		return false
	}
	if !common.MemoryCacheEnabled {
		return hasEnabledChannelTagForGroupModelDB(group, modelName, requestPath, tag)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil {
		return false
	}
	channelIDs := group2model2channels[group][modelName]
	if len(channelIDs) == 0 {
		normalized := ratio_setting.FormatMatchingModelName(modelName)
		if normalized != "" && normalized != modelName {
			channelIDs = group2model2channels[group][normalized]
		}
	}
	for _, channelID := range channelIDs {
		channel := channelsIDM[channelID]
		if channel != nil && channel.Status == common.ChannelStatusEnabled &&
			strings.EqualFold(strings.TrimSpace(channel.GetTag()), strings.TrimSpace(tag)) &&
			channel.SupportsRequestPath(requestPath, modelName) {
			return true
		}
	}
	return false
}

func ChannelMatchesRequiredTag(channel *Channel, requiredTag string) bool {
	return channel != nil && (strings.TrimSpace(requiredTag) == "" ||
		strings.EqualFold(strings.TrimSpace(channel.GetTag()), strings.TrimSpace(requiredTag)))
}

func isChannelEnabledForGroupModelDB(group string, modelName string, channelID int) bool {
	var count int64
	err := DB.Model(&Ability{}).
		Where(commonGroupCol+" = ? and model = ? and channel_id = ? and enabled = ?", group, modelName, channelID, true).
		Count(&count).Error
	if err == nil && count > 0 {
		return true
	}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized == "" || normalized == modelName {
		return false
	}
	count = 0
	err = DB.Model(&Ability{}).
		Where(commonGroupCol+" = ? and model = ? and channel_id = ? and enabled = ?", group, normalized, channelID, true).
		Count(&count).Error
	return err == nil && count > 0
}

func hasEnabledChannelTagForGroupModelDB(group string, modelName string, requestPath string, tag string) bool {
	models := []string{modelName}
	normalized := ratio_setting.FormatMatchingModelName(modelName)
	if normalized != "" && normalized != modelName {
		models = append(models, normalized)
	}
	var channels []*Channel
	err := DB.Model(&Channel{}).
		Joins("JOIN abilities ON abilities.channel_id = channels.id").
		Where("abilities."+commonGroupCol+" = ? AND abilities.model IN ? AND abilities.enabled = ? AND channels.status = ? AND LOWER(COALESCE(channels.tag, '')) = ?",
			group, models, true, common.ChannelStatusEnabled, strings.ToLower(strings.TrimSpace(tag))).
		Find(&channels).Error
	if err != nil {
		return false
	}
	for _, channel := range channels {
		if channel.SupportsRequestPath(requestPath, modelName) {
			return true
		}
	}
	return false
}

func isChannelIDInList(list []int, channelID int) bool {
	for _, id := range list {
		if id == channelID {
			return true
		}
	}
	return false
}
