package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGPT56AndGPT6DefaultPricesMatchOfficialShortContextRatios(t *testing.T) {
	require.Equal(t, 2.0, defaultModelRatio["gpt-5.6-sol"])
	require.Equal(t, 1.0, defaultModelRatio["gpt-5.6-terra"])
	require.Equal(t, 0.1, defaultModelRatio["gpt-5.6-luna"])
	require.Equal(t, 1.0, defaultModelRatio["gpt-6-sol"])
	require.Equal(t, 0.05, defaultModelRatio["gpt-6-luna"])

	require.Equal(t, 5.0, GetCompletionRatio("gpt-5.6-sol"))
	require.Equal(t, 6.0, GetCompletionRatio("gpt-5.6-terra"))
	require.Equal(t, 6.0, GetCompletionRatio("gpt-5.6-luna"))
	require.Equal(t, 5.0, GetCompletionRatio("gpt-6-sol"))
	require.Equal(t, 5.0, GetCompletionRatio("gpt-6-luna"))
}
