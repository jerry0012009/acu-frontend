package middleware

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPublicACURouterModelRequiresTaggedSupply(t *testing.T) {
	previousDB := model.DB
	previousCache := common.MemoryCacheEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	model.DB = db
	common.MemoryCacheEnabled = true
	t.Cleanup(func() {
		model.DB = previousDB
		common.MemoryCacheEnabled = previousCache
		if previousDB != nil && previousCache {
			model.InitChannelCache()
		}
	})

	acuTag := constant.ChannelTagACURouter
	require.NoError(t, db.Create(&model.Channel{
		Id: 301, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled,
		Name: "acu-router", Models: "gpt-6-astra", Group: "default", Tag: &acuTag,
	}).Error)
	require.NoError(t, db.Create(&model.Channel{
		Id: 302, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled,
		Name: "ordinary", Models: "gpt-ordinary", Group: "default",
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "gpt-6-astra", ChannelId: 301, Enabled: true,
	}).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group: "default", Model: "gpt-ordinary", ChannelId: 302, Enabled: true,
	}).Error)
	model.InitChannelCache()

	context, _ := gin.CreateTestContext(nil)
	common.SetContextKey(context, constant.ContextKeyUsingGroup, "default")
	require.True(t, isPublicACURouterModel(context, "gpt-6-astra"))
	require.False(t, isPublicACURouterModel(context, "gpt-ordinary"))
}
