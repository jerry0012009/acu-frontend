package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestACUChannelPreservesNativeProtocolDuringSelection(t *testing.T) {
	acuTag := constant.ChannelTagACURouter
	openAI := &Channel{Type: constant.ChannelTypeOpenAI, Tag: &acuTag}
	anthropic := &Channel{Type: constant.ChannelTypeAnthropic, Tag: &acuTag}

	require.True(t, openAI.SupportsRequestPath("/v1/responses", "acu-auto"))
	require.False(t, openAI.SupportsRequestPath("/v1/messages", "acu-auto"))
	require.True(t, anthropic.SupportsRequestPath("/v1/messages", "acu-auto"))
	require.False(t, anthropic.SupportsRequestPath("/v1/responses", "acu-auto"))
	require.True(t, openAI.SupportsRequestPath("/v1/chat/completions", "acu-auto"))
	require.True(t, openAI.SupportsRequestPath("/pg/chat/completions", "acu-auto"))
	require.True(t, openAI.SupportsRequestPath("/pg/chat/completions", "acu-high"))
	require.True(t, openAI.SupportsRequestPath("/pg/chat/completions", "future-root-catalog-model"))
	require.False(t, anthropic.SupportsRequestPath("/pg/chat/completions", "acu-auto"))
	require.False(t, openAI.SupportsRequestPath("/pg/images/generations", "gpt-image-2"))
}

func TestSub2APIImageChannelSupportsVerifiedImageProtocols(t *testing.T) {
	channel := &Channel{Type: constant.ChannelTypeSub2API}

	require.True(t, channel.SupportsRequestPath("/v1/images/generations", "gpt-image-2"))
	require.True(t, channel.SupportsRequestPath("/pg/images/generations", "gpt-image-2"))
	require.True(t, channel.SupportsRequestPath("/v1/chat/completions", "gpt-image-2"))
	require.False(t, channel.SupportsRequestPath("/v1/responses", "gpt-image-2"))
	require.False(t, channel.SupportsRequestPath("/v1/messages", "gpt-image-2"))
	require.True(t, channel.SupportsRequestPath("/v1/responses", "gpt-5.6-luna"))
}
