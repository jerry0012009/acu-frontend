package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestACUTokenProfileRoutingUpdatesOnlyTheSelectedTokenScope(t *testing.T) {
	clearACUChannelMonitorCache()
	previousDB := model.DB
	previousOptions := common.OptionMap
	previousRedis := common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	model.DB = db
	common.RedisEnabled = false
	common.OptionMap = map[string]string{}
	t.Cleanup(func() {
		clearACUChannelMonitorCache()
		model.DB = previousDB
		common.OptionMap = previousOptions
		common.RedisEnabled = previousRedis
	})

	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"profiles":[{
				"executionProfileId":"provider:model:responses",
				"canonicalModel":"model","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":true
			},{
				"executionProfileId":"provider:model:messages",
				"canonicalModel":"model","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":true
			}],
			"history":[],"cooldownIntervals":[],"probeHistory":[],
			"supplyInventory":[],"modelPool":[]
		}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	token := model.Token{UserId: 7, Key: "profile-routing-test", Name: "primary"}
	require.NoError(t, model.DB.Create(&token).Error)

	scope, err := GetACUTokenProfileRoutingScope(context.Background(), 7, token.Id)
	require.NoError(t, err)
	require.False(t, scope.Custom)
	require.Equal(t, []string{
		"provider:model:messages",
		"provider:model:responses",
	}, scope.EffectiveProfileIDs)

	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:messages",
			Enabled:            false,
		},
	)
	require.NoError(t, err)
	require.True(t, scope.Custom)
	require.Equal(t, []string{"provider:model:responses"}, scope.EffectiveProfileIDs)

	_, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:responses",
			Enabled:            false,
		},
	)
	require.ErrorContains(t, err, "at least one ACU Profile")

	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:messages",
			Enabled:            true,
		},
	)
	require.NoError(t, err)
	require.False(t, scope.Custom)

	stored, err := model.GetTokenByIds(token.Id, 7)
	require.NoError(t, err)
	require.False(t, stored.ACUProfileLimitsEnabled)
	require.Empty(t, stored.ACUProfileLimits)

	_, err = GetACUTokenProfileRoutingScope(context.Background(), 8, token.Id)
	require.Error(t, err)
}
