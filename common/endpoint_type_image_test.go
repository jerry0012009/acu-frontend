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
