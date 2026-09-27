package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestReconcileACURouterAbilitiesUsesRoutingCatalogProtocols(t *testing.T) {
	resetPricingEndpointTestTables(t)
	tag := constant.ChannelTagACURouter
	responses := &Channel{
		Id: 1, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled,
		Name: "ACU Responses", Models: "acu-auto,gpt-old,claude-old", Group: "default", Tag: &tag,
	}
	messages := &Channel{
		Id: 2, Type: constant.ChannelTypeAnthropic, Status: common.ChannelStatusEnabled,
		Name: "ACU Messages", Models: "acu-auto,gpt-old,claude-opus-5-5", Group: "default", Tag: &tag,
	}
	require.NoError(t, DB.Create(responses).Error)
	require.NoError(t, DB.Create(messages).Error)
	for _, ability := range []Ability{
		{Group: "default", Model: "acu-auto", ChannelId: 1, Enabled: true, Tag: &tag},
		{Group: "default", Model: "acu-high", ChannelId: 1, Enabled: true, Tag: &tag},
		{Group: "default", Model: "gpt-old", ChannelId: 1, Enabled: true, Tag: &tag},
		{Group: "default", Model: "acu-auto", ChannelId: 2, Enabled: true, Tag: &tag},
		{Group: "default", Model: "gpt-old", ChannelId: 2, Enabled: true, Tag: &tag},
	} {
		require.NoError(t, DB.Create(&ability).Error)
	}

	catalog := dto.ACURoutingCatalog{Models: []dto.ACURoutingCatalogModel{
		{ModelID: "gpt-5.6-sol", Protocols: []string{"responses", "chat_completions"}},
		{ModelID: "claude-opus-5-5", Protocols: []string{"messages"}},
	}}
	require.NoError(t, ReconcileACURouterAbilities(catalog))

	var gotChannels []Channel
	require.NoError(t, DB.Where("id IN ?", []int{1, 2}).Order("id asc").Find(&gotChannels).Error)
	require.Equal(t, "acu-auto,acu-high,gpt-5.6-sol", gotChannels[0].Models)
	require.Equal(t, "acu-auto,claude-opus-5-5", gotChannels[1].Models)

	var abilities []Ability
	require.NoError(t, DB.Where("channel_id IN ?", []int{1, 2}).Order("channel_id asc, model asc").Find(&abilities).Error)
	require.Equal(t, []string{
		"1:acu-auto", "1:acu-high", "1:gpt-5.6-sol",
		"2:acu-auto", "2:claude-opus-5-5",
	}, abilityKeys(abilities))
}

func abilityKeys(abilities []Ability) []string {
	result := make([]string, 0, len(abilities))
	for _, ability := range abilities {
		result = append(result, fmt.Sprintf("%d:%s", ability.ChannelId, ability.Model))
	}
	return result
}
