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
	"github.com/stretchr/testify/assert"
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

	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/admin/execution-profiles" {
			http.Error(w, "monitor aggregation is unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"profiles":[{
				"executionProfileId":"provider:model:responses",
				"modelId":"model","routingEnabled":true,
				"routingWeight":130
			},{
				"executionProfileId":"provider:model:messages",
				"modelId":"model","routingEnabled":true,
				"routingWeight":80
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
	require.Equal(t, map[string]float64{
		"provider:model:messages":  80,
		"provider:model:responses": 130,
	}, scope.EffectiveWeights)

	disabled := false
	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:messages",
			Enabled:            &disabled,
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
			Enabled:            &disabled,
		},
	)
	require.ErrorContains(t, err, "at least one ACU Profile")

	enabled := true
	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:messages",
			Enabled:            &enabled,
		},
	)
	require.NoError(t, err)
	require.False(t, scope.Custom)

	stored, err := model.GetTokenByIds(token.Id, 7)
	require.NoError(t, err)
	require.False(t, stored.ACUProfileLimitsEnabled)
	require.Empty(t, stored.ACUProfileLimits)

	neutral := 100.0
	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:responses",
			Weight:             &neutral,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 100.0, scope.ConfiguredWeights["provider:model:responses"])
	require.Equal(t, 100.0, scope.EffectiveWeights["provider:model:responses"])

	special := 400.0
	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:responses",
			Weight:             &special,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 400.0, scope.EffectiveWeights["provider:model:responses"])

	invalid := 501.0
	_, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:responses",
			Weight:             &invalid,
		},
	)
	require.ErrorContains(t, err, "from 0 to 500")

	scope, err = UpdateACUTokenProfileRouting(
		context.Background(),
		7,
		token.Id,
		dto.ACUTokenProfileRoutingUpdate{
			ExecutionProfileID: "provider:model:responses",
			InheritWeight:      true,
		},
	)
	require.NoError(t, err)
	require.NotContains(t, scope.ConfiguredWeights, "provider:model:responses")
	require.Equal(t, 130.0, scope.EffectiveWeights["provider:model:responses"])

	_, err = GetACUTokenProfileRoutingScope(context.Background(), 8, token.Id)
	require.Error(t, err)
}

func TestACUTokenProfileBatchPreservesOtherModelsAndRejectsInvalidSelections(t *testing.T) {
	previousDB, previousOptions, previousRedis := model.DB, common.OptionMap, common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	model.DB, common.OptionMap, common.RedisEnabled = db, map[string]string{}, false
	t.Cleanup(func() {
		model.DB, common.OptionMap, common.RedisEnabled = previousDB, previousOptions, previousRedis
	})
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/admin/execution-profiles" {
			http.Error(w, "monitor unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"profiles":[
			{"executionProfileId":"a","modelId":"target","routingEnabled":true,"routingWeight":100},
			{"executionProfileId":"b","modelId":"target","routingEnabled":true,"routingWeight":100},
			{"executionProfileId":"other","modelId":"other","routingEnabled":true,"routingWeight":100},
			{"executionProfileId":"blocked","modelId":"target","routingEnabled":false,"routingWeight":100}
		]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	token := model.Token{UserId: 7, Key: "batch-key", Name: "keep name", RemainQuota: 123,
		ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"b", "other", "temporarily-offline"},
		ACUProfilePreferenceScores: map[string]float64{"other": 175}}
	require.NoError(t, db.Create(&token).Error)
	scope, err := UpdateACUTokenProfileRouting(context.Background(), 7, token.Id, dto.ACUTokenProfileRoutingUpdate{
		ModelID: "target", ProfileStates: map[string]bool{"a": true, "b": false},
	})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"a", "other"}, scope.EffectiveProfileIDs)
	stored, err := model.GetTokenByIds(token.Id, 7)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"a", "other", "temporarily-offline"}, stored.ACUProfileLimits)
	assert.Equal(t, 175.0, stored.ACUProfilePreferenceScores["other"])
	assert.Equal(t, "keep name", stored.Name)
	assert.Equal(t, 123, stored.RemainQuota)

	for _, states := range []map[string]bool{
		{"a": false, "b": false},
		{"a": false, "other": true},
		{"a": false, "blocked": true},
		{"a": false, "missing": true},
		{},
	} {
		_, err := UpdateACUTokenProfileRouting(context.Background(), 7, token.Id, dto.ACUTokenProfileRoutingUpdate{
			ModelID: "target", ProfileStates: states,
		})
		require.Error(t, err)
		unchanged, err := model.GetTokenByIds(token.Id, 7)
		require.NoError(t, err)
		assert.Equal(t, stored.ACUProfileLimits, unchanged.ACUProfileLimits)
	}
	_, err = UpdateACUTokenProfileRouting(context.Background(), 8, token.Id, dto.ACUTokenProfileRoutingUpdate{
		ModelID: "target", ProfileStates: map[string]bool{"b": true},
	})
	require.Error(t, err)
}
