package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingOnlyLabelsReportedCapabilities(t *testing.T) {
	for _, tc := range []struct {
		name             string
		tools, reasoning bool
	}{
		{name: "neither"},
		{name: "tools", tools: true},
		{name: "reasoning", reasoning: true},
		{name: "both", tools: true, reasoning: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows := overlayACUPricing(&acuPricingCatalog{Responses: []acuPricingResponse{{
				ModelID: "capability-test", Protocol: "Responses", ToolCall: tc.tools, Reasoning: tc.reasoning,
			}}}, nil)
			require.NotEmpty(t, rows)
			found := false
			for _, row := range rows {
				if row.ModelName != "capability-test" {
					continue
				}
				found = true
				for _, text := range []string{row.Description, row.Tags} {
					if tc.tools {
						assert.Contains(t, text, "Tool Call")
					} else {
						assert.NotContains(t, text, "Tool Call")
					}
					if tc.reasoning {
						assert.Contains(t, text, "Reasoning")
					} else {
						assert.NotContains(t, text, "Reasoning")
					}
				}
			}
			assert.True(t, found)
		})
	}
}
