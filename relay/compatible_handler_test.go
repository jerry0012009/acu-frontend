package relay

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/require"
)

func TestACUPlaygroundChatCompletionsUsesResponsesBridge(t *testing.T) {
	require.True(t, shouldUseACUPlaygroundResponsesBridge(&relaycommon.RelayInfo{
		IsACUChannel: true, IsPlayground: true,
		RelayMode: relayconstant.RelayModeChatCompletions,
	}))
}

func TestResponsesBridgeDoesNotChangeNonACUChatCompletions(t *testing.T) {
	require.False(t, shouldUseACUPlaygroundResponsesBridge(&relaycommon.RelayInfo{
		IsPlayground: true, RelayMode: relayconstant.RelayModeChatCompletions,
	}))
}
