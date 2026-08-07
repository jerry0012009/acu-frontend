package service

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestACUVirtualModelsUseResponsesForPlaygroundCompatibility(t *testing.T) {
	require.True(t, ShouldChatCompletionsUseResponsesGlobal(1, constant.ChannelTypeOpenAI, "acu-auto"))
	require.True(t, ShouldChatCompletionsUseResponsesGlobal(1, constant.ChannelTypeOpenAI, "acu-high"))
	require.False(t, ShouldChatCompletionsUseResponsesGlobal(1, constant.ChannelTypeAnthropic, "acu-auto"))
	require.False(t, ShouldChatCompletionsUseResponsesGlobal(1, constant.ChannelTypeOpenAI, "gpt-5.6-luna"))
}
