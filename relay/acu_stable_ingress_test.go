package relay

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestACUWireUsesExplicitStableIngressWithoutChangingChannel(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "http://legacy-router:8403"},
		RequestURLPath: "/v1/responses",
	}
	t.Setenv("ACU_ROUTER_RELAY_URL", "http://acu-release-proxy:8403/")
	url, err := (acuWireAdaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "http://acu-release-proxy:8403/v1/responses", url)
	assert.Equal(t, "http://legacy-router:8403", info.ChannelBaseUrl)

	t.Setenv("ACU_ROUTER_RELAY_URL", "")
	url, err = (acuWireAdaptor{}).GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "http://legacy-router:8403/v1/responses", url)
}
