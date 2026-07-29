package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestACUChannelAlwaysOwnsZeroNewAPIRetries(t *testing.T) {
	previous := common.RetryTimes
	common.RetryTimes = 3
	t.Cleanup(func() { common.RetryTimes = previous })
	require.Equal(t, 0, relayMaxRetries(&relaycommon.RelayInfo{IsACUChannel: true}))
	require.Equal(t, 3, relayMaxRetries(&relaycommon.RelayInfo{}))
}
