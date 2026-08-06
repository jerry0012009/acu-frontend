package claude

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestClaudeRequestURLPreservesBetaQuery(t *testing.T) {
	adaptor := &Adaptor{}
	url, err := adaptor.GetRequestURL(&relaycommon.RelayInfo{
		IsClaudeBetaQuery: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: "https://router.example",
		},
	})
	require.NoError(t, err)
	require.Equal(t, "https://router.example/v1/messages?beta=true", url)
}
