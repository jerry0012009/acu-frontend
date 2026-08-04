package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseACUTimelineRangeAllowsSevenDays(t *testing.T) {
	now := int64(2_000_000)
	from, to, err := parseACUTimelineRange("1395200", "2000000", now)
	require.NoError(t, err)
	assert.Equal(t, int64(1_395_200), from)
	assert.Equal(t, now, to)
}

func TestParseACUTimelineRangeRejectsInvalidRanges(t *testing.T) {
	now := int64(2_000_000)
	tests := []struct {
		name, from, to, message string
	}{
		{name: "over seven days", from: "1395199", to: "2000000", message: "time range must not exceed 7 days"},
		{name: "future end", from: "1999999", to: "2000001", message: "to must not be in the future"},
		{name: "reversed", from: "2000000", to: "1999999", message: "to must be greater than from"},
		{name: "invalid from", from: "invalid", to: "2000000", message: "from must be a positive Unix timestamp"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, _, err := parseACUTimelineRange(test.from, test.to, now)
			require.EqualError(t, err, test.message)
		})
	}
}
