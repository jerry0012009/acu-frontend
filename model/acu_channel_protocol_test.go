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
	require.False(t, openAI.SupportsRequestPath("/v1/chat/completions", "acu-auto"))
}
