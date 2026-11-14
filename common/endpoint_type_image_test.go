package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestSub2APIImageModelAdvertisesVerifiedEndpoints(t *testing.T) {
	require.Equal(t, []constant.EndpointType{
		constant.EndpointTypeImageGeneration,
		constant.EndpointTypeOpenAI,
	}, GetEndpointTypesByChannelType(constant.ChannelTypeSub2API, "gpt-image-2"))
}

func TestWawazzMediaEndpoints(t *testing.T) {
	require.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAIVideo}, GetEndpointTypesByChannelType(constant.ChannelTypeOpenAI, "grok-imagine-video"))
	require.Contains(t, GetEndpointTypesByChannelType(constant.ChannelTypeGemini, "gemini-3.1-flash-image-preview"), constant.EndpointTypeImageGeneration)
	require.Contains(t, GetEndpointTypesByChannelType(constant.ChannelTypeGemini, "nano-banana-pro"), constant.EndpointTypeImageGeneration)
	require.False(t, IsImageGenerationModel("grok-imagine-video"))
}
