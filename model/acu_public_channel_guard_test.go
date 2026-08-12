package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestACUPublicCanonicalModelRequiresRouterTag(t *testing.T) {
	resetPricingEndpointTestTables(t)

	acuTag := constant.ChannelTagACURouter
	require.NoError(t, DB.Create(&Channel{
		Id: 201, Type: constant.ChannelTypeOpenAI, Key: "acu-key",
		Status: common.ChannelStatusEnabled, Name: "acu-router", Models: "gpt-5.6-terra",
		Group: "default", Tag: &acuTag,
	}).Error)
	require.NoError(t, DB.Create(&Channel{
		Id: 202, Type: constant.ChannelTypeOpenAI, Key: "supply-key",
		Status: common.ChannelStatusEnabled, Name: "raw-supply", Models: "gpt-5.6-terra",
		Group: "default",
	}).Error)
	insertPricingEndpointAbility(t, 201, "gpt-5.6-terra")
	insertPricingEndpointAbility(t, 202, "gpt-5.6-terra")
	InitChannelCache()

	require.True(t, HasEnabledChannelTagForGroupModel(
		"default", "gpt-5.6-terra", "/v1/responses", constant.ChannelTagACURouter,
	))
	for range 20 {
		channel, err := GetRandomSatisfiedChannel(
			"default", "gpt-5.6-terra", 0, "/v1/responses", constant.ChannelTagACURouter,
		)
		require.NoError(t, err)
		require.Equal(t, 201, channel.Id)
		require.Equal(t, constant.ChannelTagACURouter, channel.GetTag())
	}
}

func TestACUPublicCanonicalModelRequiresRouterTagWithoutMemoryCache(t *testing.T) {
	resetPricingEndpointTestTables(t)
	common.MemoryCacheEnabled = false

	acuTag := constant.ChannelTagACURouter
	priority := int64(10)
	weight := uint(100)
	require.NoError(t, DB.Create(&Channel{
		Id: 206, Type: constant.ChannelTypeOpenAI, Key: "acu-db-key",
		Status: common.ChannelStatusEnabled, Name: "acu-router-db", Models: "gpt-5.6-terra",
		Group: "default", Tag: &acuTag, Priority: &priority, Weight: &weight,
	}).Error)
	require.NoError(t, DB.Create(&Channel{
		Id: 207, Type: constant.ChannelTypeOpenAI, Key: "supply-db-key",
		Status: common.ChannelStatusEnabled, Name: "raw-supply-db", Models: "gpt-5.6-terra",
		Group: "default", Priority: &priority, Weight: &weight,
	}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group: "default", Model: "gpt-5.6-terra", ChannelId: 206,
		Enabled: true, Priority: &priority, Weight: weight,
	}).Error)
	require.NoError(t, DB.Create(&Ability{
		Group: "default", Model: "gpt-5.6-terra", ChannelId: 207,
		Enabled: true, Priority: &priority, Weight: weight,
	}).Error)

	require.True(t, HasEnabledChannelTagForGroupModel(
		"default", "gpt-5.6-terra", "/v1/responses", constant.ChannelTagACURouter,
	))
	for range 20 {
		channel, err := GetRandomSatisfiedChannel(
			"default", "gpt-5.6-terra", 0, "/v1/responses", constant.ChannelTagACURouter,
		)
		require.NoError(t, err)
		require.NotNil(t, channel)
		require.Equal(t, 206, channel.Id)
		require.Equal(t, constant.ChannelTagACURouter, channel.GetTag())
	}
}

func TestRequiredRouterTagDoesNotAffectOrdinaryModels(t *testing.T) {
	resetPricingEndpointTestTables(t)

	require.NoError(t, DB.Create(&Channel{
		Id: 203, Type: constant.ChannelTypeOpenAI, Key: "ordinary-key",
		Status: common.ChannelStatusEnabled, Name: "ordinary", Models: "gpt-ordinary",
		Group: "default",
	}).Error)
	insertPricingEndpointAbility(t, 203, "gpt-ordinary")
	InitChannelCache()

	require.False(t, HasEnabledChannelTagForGroupModel(
		"default", "gpt-ordinary", "/v1/responses", constant.ChannelTagACURouter,
	))
	channel, err := GetRandomSatisfiedChannel("default", "gpt-ordinary", 0, "/v1/responses", "")
	require.NoError(t, err)
	require.Equal(t, 203, channel.Id)
}

func TestRequiredRouterTagHonorsNativeProtocol(t *testing.T) {
	resetPricingEndpointTestTables(t)

	acuTag := constant.ChannelTagACURouter
	require.NoError(t, DB.Create(&Channel{
		Id: 204, Type: constant.ChannelTypeOpenAI, Key: "responses-key",
		Status: common.ChannelStatusEnabled, Name: "acu-responses", Models: "claude-test",
		Group: "default", Tag: &acuTag,
	}).Error)
	require.NoError(t, DB.Create(&Channel{
		Id: 205, Type: constant.ChannelTypeAnthropic, Key: "messages-key",
		Status: common.ChannelStatusEnabled, Name: "acu-messages", Models: "claude-test",
		Group: "default", Tag: &acuTag,
	}).Error)
	insertPricingEndpointAbility(t, 204, "claude-test")
	insertPricingEndpointAbility(t, 205, "claude-test")
	InitChannelCache()

	responses, err := GetRandomSatisfiedChannel(
		"default", "claude-test", 0, "/v1/responses", constant.ChannelTagACURouter,
	)
	require.NoError(t, err)
	require.Equal(t, 204, responses.Id)

	messages, err := GetRandomSatisfiedChannel(
		"default", "claude-test", 0, "/v1/messages", constant.ChannelTagACURouter,
	)
	require.NoError(t, err)
	require.Equal(t, 205, messages.Id)
}
