package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageChannelAvailabilityScopesGroupModelAndEnabledStatus(t *testing.T) {
	for _, useCache := range []bool{false, true} {
		name := "database"
		if useCache {
			name = "cache"
		}
		t.Run(name, func(t *testing.T) {
			resetPricingEndpointTestTables(t)
			common.MemoryCacheEnabled = useCache
			require.NoError(t, DB.Create(&Channel{
				Id: 301, Type: constant.ChannelTypeOpenAI, Key: "test-key",
				Status: common.ChannelStatusEnabled, Name: "image-channel",
				Models: "gpt-image-2", Group: "default",
			}).Error)
			insertPricingEndpointAbility(t, 301, "gpt-image-2")
			InitChannelCache()
			assert.True(t, HasEnabledChannelForGroupModel("default", "gpt-image-2", "/v1/images/generations"))
			assert.False(t, HasEnabledChannelForGroupModel("other", "gpt-image-2", "/v1/images/generations"))
			assert.False(t, HasEnabledChannelForGroupModel("default", "unavailable-image", "/v1/images/generations"))
			require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 301).Update("status", common.ChannelStatusManuallyDisabled).Error)
			InitChannelCache()
			assert.False(t, HasEnabledChannelForGroupModel("default", "gpt-image-2", "/v1/images/generations"))
		})
	}
}
