package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSortPricingModelsIsDeterministicByModelName(t *testing.T) {
	pricing := []Pricing{
		{ModelName: "gpt-6-sol"},
		{ModelName: "acu-auto"},
		{ModelName: "gpt-5.6-luna"},
	}

	sortPricingModels(pricing)

	require.Equal(t, []string{"acu-auto", "gpt-5.6-luna", "gpt-6-sol"}, []string{
		pricing[0].ModelName,
		pricing[1].ModelName,
		pricing[2].ModelName,
	})
}
