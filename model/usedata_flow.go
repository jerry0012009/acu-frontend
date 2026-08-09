package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type FlowQuotaData struct {
	UserID      int    `json:"user_id,omitempty" gorm:"column:user_id"`
	Username    string `json:"username,omitempty" gorm:"column:username"`
	NodeName    string `json:"node_name,omitempty" gorm:"column:node_name"`
	TokenID     int    `json:"token_id,omitempty" gorm:"column:token_id"`
	TokenName   string `json:"token_name,omitempty" gorm:"-"`
	UseGroup    string `json:"use_group" gorm:"column:use_group"`
	ChannelID   int    `json:"channel_id,omitempty" gorm:"column:channel_id"`
	ChannelName string `json:"channel_name,omitempty" gorm:"-"`
	ModelName   string `json:"model_name" gorm:"column:model_name"`
	TokenUsed   int    `json:"token_used" gorm:"column:token_used"`
	Count       int    `json:"count" gorm:"column:count"`
	Quota       int    `json:"quota" gorm:"column:quota"`
}

func GetFlowQuotaData(startTime int64, endTime int64, username string, userID int, role int) ([]*FlowQuotaData, error) {
	switch {
	case role >= common.RoleRootUser:
		return getRootFlowQuotaData(startTime, endTime, username)
	case role >= common.RoleAdminUser:
		return getAdminFlowQuotaData(startTime, endTime, username)
	default:
		return getSelfFlowQuotaData(startTime, endTime, userID)
	}
}

func flowQuotaBaseQuery(startTime int64, endTime int64) *gorm.DB {
	query := DB.Table("quota_data").
		Where("use_group <> ''").
		Where("created_at >= ? and created_at <= ?", startTime, endTime)
	return query
}

func getSelfFlowQuotaData(startTime int64, endTime int64, userID int) ([]*FlowQuotaData, error) {
	rows := make([]*FlowQuotaData, 0)
	err := flowQuotaBaseQuery(startTime, endTime).
		Select("token_id, use_group, model_name, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used").
		Where("user_id = ?", userID).
		Group("token_id, use_group, model_name").
		Order("quota DESC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	rows, err = appendACUFlowQuotaData(rows, startTime, endTime, userID, "", common.RoleCommonUser)
	if err != nil {
		return nil, err
	}
	return rows, fillFlowTokenNames(rows)
}

func getAdminFlowQuotaData(startTime int64, endTime int64, username string) ([]*FlowQuotaData, error) {
	rows := make([]*FlowQuotaData, 0)
	query := flowQuotaBaseQuery(startTime, endTime).
		Select("user_id, username, use_group, model_name, channel_id, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used")
	if username != "" {
		query = query.Where("username = ?", username)
	}
	err := query.
		Group("user_id, username, use_group, model_name, channel_id").
		Order("quota DESC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	rows, err = appendACUFlowQuotaData(rows, startTime, endTime, 0, username, common.RoleAdminUser)
	if err != nil {
		return nil, err
	}
	return rows, fillFlowChannelNames(rows)
}

func getRootFlowQuotaData(startTime int64, endTime int64, username string) ([]*FlowQuotaData, error) {
	rows := make([]*FlowQuotaData, 0)
	query := flowQuotaBaseQuery(startTime, endTime).
		Select("user_id, username, node_name, token_id, use_group, model_name, channel_id, sum(count) as count, sum(quota) as quota, sum(token_used) as token_used")
	if username != "" {
		query = query.Where("username = ?", username)
	}
	err := query.
		Group("user_id, username, node_name, token_id, use_group, model_name, channel_id").
		Order("quota DESC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	if err := fillFlowTokenNames(rows); err != nil {
		return rows, err
	}
	rows, err = appendACUFlowQuotaData(rows, startTime, endTime, 0, username, common.RoleRootUser)
	if err != nil {
		return nil, err
	}
	if err := fillFlowTokenNames(rows); err != nil {
		return rows, err
	}
	return rows, fillFlowChannelNames(rows)
}

type acuFlowQuotaData struct {
	UserID    int    `gorm:"column:user_id"`
	TokenID   int    `gorm:"column:token_id"`
	ModelName string `gorm:"column:model_name"`
	Provider  string `gorm:"column:provider"`
	Channel   string `gorm:"column:channel"`
	Count     int    `gorm:"column:count"`
	Quota     int    `gorm:"column:quota"`
	TokenUsed int    `gorm:"column:token_used"`
}

// appendACUFlowQuotaData exposes finalized ACU requests through the existing
// flow-data contract. ACU requests already charge the wallet during settlement;
// this function is reporting-only and never mutates quota or usage logs.
func appendACUFlowQuotaData(
	rows []*FlowQuotaData,
	startTime int64,
	endTime int64,
	userID int,
	username string,
	role int,
) ([]*FlowQuotaData, error) {
	if !DB.Migrator().HasTable("acu_usage_finalizes") {
		return rows, nil
	}
	if userID <= 0 && username != "" {
		var user User
		if err := DB.Select("id").Where("username = ?", username).First(&user).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return rows, nil
			}
			return nil, err
		}
		userID = user.Id
	}

	query := DB.Table("acu_usage_finalizes").
		Select("user_id, token_id, actual_model as model_name, provider, channel, count(*) as count, sum(final_quota) as quota, sum(input_tokens + output_tokens) as token_used").
		Where("status = ? AND created_at >= ? AND created_at <= ?", ACUFinalizeStatusFinalized, startTime, endTime)
	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}

	var acuRows []*acuFlowQuotaData
	if err := query.
		Group("user_id, token_id, actual_model, provider, channel").
		Order("quota DESC").
		Find(&acuRows).Error; err != nil {
		return nil, err
	}
	if len(acuRows) == 0 {
		return rows, nil
	}

	userIDs := make([]int, 0, len(acuRows))
	seenUserIDs := make(map[int]struct{}, len(acuRows))
	for _, acuRow := range acuRows {
		if _, ok := seenUserIDs[acuRow.UserID]; ok {
			continue
		}
		seenUserIDs[acuRow.UserID] = struct{}{}
		userIDs = append(userIDs, acuRow.UserID)
	}
	var users []User
	if err := DB.Select("id, username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return nil, err
	}
	usernameByID := make(map[int]string, len(users))
	for _, user := range users {
		usernameByID[user.Id] = user.Username
	}

	for _, acuRow := range acuRows {
		item := &FlowQuotaData{
			UserID:      acuRow.UserID,
			Username:    usernameByID[acuRow.UserID],
			NodeName:    "acu-router",
			TokenID:     acuRow.TokenID,
			UseGroup:    "acu-auto",
			ModelName:   acuRow.ModelName,
			TokenUsed:   acuRow.TokenUsed,
			Count:       acuRow.Count,
			Quota:       acuRow.Quota,
			ChannelName: formatACUFlowChannel(acuRow.Provider, acuRow.Channel),
		}
		switch {
		case role >= common.RoleRootUser:
			// Keep all dimensions for root users.
		case role >= common.RoleAdminUser:
			// Admin flow intentionally does not expose token/node dimensions.
			item.NodeName = ""
			item.TokenID = 0
		default:
			// Self flow intentionally does not expose user/node/channel dimensions.
			item.UserID = 0
			item.Username = ""
			item.NodeName = ""
			item.ChannelName = ""
		}
		rows = append(rows, item)
	}
	return rows, nil
}

func formatACUFlowChannel(provider, channel string) string {
	provider = strings.TrimSpace(provider)
	channel = strings.TrimSpace(channel)
	switch {
	case provider == "" && channel == "":
		return "acu-router"
	case provider == "":
		return channel
	case channel == "":
		return provider
	default:
		return provider + "/" + channel
	}
}

func fillFlowTokenNames(rows []*FlowQuotaData) error {
	tokenIDSet := make(map[int]struct{})
	tokenIDs := make([]int, 0)
	for _, row := range rows {
		if row.TokenID == 0 {
			continue
		}
		if _, ok := tokenIDSet[row.TokenID]; ok {
			continue
		}
		tokenIDSet[row.TokenID] = struct{}{}
		tokenIDs = append(tokenIDs, row.TokenID)
	}
	if len(tokenIDs) == 0 {
		return nil
	}

	var tokens []struct {
		Id   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}
	if err := DB.Model(&Token{}).Select("id, name").Where("id IN ?", tokenIDs).Find(&tokens).Error; err != nil {
		return err
	}
	tokenNameByID := make(map[int]string, len(tokens))
	for _, token := range tokens {
		tokenNameByID[token.Id] = token.Name
	}
	// Deleted tokens are intentionally not resolved here: leave TokenName empty
	// so the frontend can render a localized "deleted (id)" label instead.
	for _, row := range rows {
		if name := tokenNameByID[row.TokenID]; name != "" {
			row.TokenName = name
		}
	}
	return nil
}

func fillFlowChannelNames(rows []*FlowQuotaData) error {
	channelIDSet := make(map[int]struct{})
	channelIDs := make([]int, 0)
	for _, row := range rows {
		if row.ChannelID == 0 {
			continue
		}
		if _, ok := channelIDSet[row.ChannelID]; ok {
			continue
		}
		channelIDSet[row.ChannelID] = struct{}{}
		channelIDs = append(channelIDs, row.ChannelID)
	}
	if len(channelIDs) == 0 {
		return nil
	}

	channelNameByID := make(map[int]string, len(channelIDs))
	if common.MemoryCacheEnabled {
		for _, channelID := range channelIDs {
			if channel, err := CacheGetChannel(channelID); err == nil {
				channelNameByID[channelID] = channel.Name
			}
		}
	} else {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if err := DB.Table("channels").Select("id, name").Where("id IN ?", channelIDs).Find(&channels).Error; err != nil {
			return err
		}
		for _, channel := range channels {
			channelNameByID[channel.Id] = channel.Name
		}
	}
	for _, row := range rows {
		if name := channelNameByID[row.ChannelID]; name != "" {
			row.ChannelName = name
			continue
		}
		if row.ChannelID > 0 {
			row.ChannelName = fmt.Sprintf("channel-%d", row.ChannelID)
		}
	}
	return nil
}
