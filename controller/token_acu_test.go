package controller

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeACUTokenModelLimitsAddsVirtualEntryModels(t *testing.T) {
	require.Equal(t, "acu-auto,acu-high,gpt-5.6-luna", normalizeACUTokenModelLimits("gpt-5.6-luna,acu-auto"))
}

func TestNormalizeACUProfileLimitsSortsAndDeduplicates(t *testing.T) {
	require.Equal(t, []string{"a:profile", "b:profile"}, normalizeACUProfileLimits([]string{" b:profile ", "a:profile", "a:profile"}))
}
