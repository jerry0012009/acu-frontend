package model

import (
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ReconcileACURouterAbilities rebuilds the generated abilities for the two
// ACU protocol channels. Manually managed abilities with another tag are left
// untouched.
func ReconcileACURouterAbilities(catalog dto.ACURoutingCatalog) error {
	desiredByType := map[int]map[string]struct{}{
		constant.ChannelTypeOpenAI:    {},
		constant.ChannelTypeAnthropic: {},
	}
	for _, catalogModel := range catalog.Models {
		for _, protocol := range catalogModel.Protocols {
			switch protocol {
			case "responses", "chat_completions":
				desiredByType[constant.ChannelTypeOpenAI][catalogModel.ModelID] = struct{}{}
			case "messages":
				desiredByType[constant.ChannelTypeAnthropic][catalogModel.ModelID] = struct{}{}
			}
		}
	}

	var channels []*Channel
	if err := DB.Where("LOWER(COALESCE(tag, '')) = ?", constant.ChannelTagACURouter).
		Where("type IN ?", []int{constant.ChannelTypeOpenAI, constant.ChannelTypeAnthropic}).
		Order("id asc").Find(&channels).Error; err != nil {
		return err
	}
	if len(channels) == 0 {
		return fmt.Errorf("no ACU router channels found")
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		for _, channel := range channels {
			desired := make(map[string]struct{}, len(desiredByType[channel.Type])+2)
			for modelID := range desiredByType[channel.Type] {
				desired[modelID] = struct{}{}
			}

			var generated []Ability
			if err := tx.Where("channel_id = ? AND tag = ?", channel.Id, constant.ChannelTagACURouter).
				Find(&generated).Error; err != nil {
				return err
			}
			for _, ability := range generated {
				if strings.HasPrefix(ability.Model, "acu-") {
					desired[ability.Model] = struct{}{}
				}
			}
			for _, modelID := range channel.GetModels() {
				modelID = strings.TrimSpace(modelID)
				if strings.HasPrefix(modelID, "acu-") {
					desired[modelID] = struct{}{}
				}
			}

			models := make([]string, 0, len(desired))
			for modelID := range desired {
				if strings.TrimSpace(modelID) != "" {
					models = append(models, modelID)
				}
			}
			sort.Strings(models)
			if err := tx.Model(&Channel{}).Where("id = ?", channel.Id).Update("models", strings.Join(models, ",")).Error; err != nil {
				return err
			}
			if err := tx.Where("channel_id = ? AND tag = ?", channel.Id, constant.ChannelTagACURouter).
				Delete(&Ability{}).Error; err != nil {
				return err
			}

			groups := channel.GetGroups()
			if len(groups) == 0 {
				groups = []string{"default"}
			}
			abilities := make([]Ability, 0, len(models)*len(groups))
			for _, modelID := range models {
				for _, group := range groups {
					abilities = append(abilities, Ability{
						Group: strings.TrimSpace(group), Model: modelID, ChannelId: channel.Id,
						Enabled: channel.Status == common.ChannelStatusEnabled, Priority: channel.Priority,
						Weight: uint(channel.GetWeight()), Tag: channel.Tag,
					})
				}
			}
			if len(abilities) > 0 {
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&abilities).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	InitChannelCache()
	return nil
}
