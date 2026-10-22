package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicPricingReadsCurrentPublicNoteAndKeepsAnonymousRouteStable(t *testing.T) {
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{}
	var previousID string
	for _, notes := range []string{
		`{"provider:model:messages":"Public note"}`,
		`{"provider:model:messages":"Updated note"}`,
		`{}`,
	} {
		common.OptionMap[acuProfilePublicNotesOption] = notes
		var corridor map[string]interface{}
		require.NoError(t, common.UnmarshalJsonStr(`{
			"pricing":{"model":{"executionProfileId":"provider:model:messages","routes":[
				{"executionProfileId":"provider:model:messages","displayName":"Internal","selected":true,
				 "payable":{"inputCnyPerMillion":1.25,"outputCnyPerMillion":5,"cacheWriteCnyPerMillion":1.5}},
				{"displayName":"Missing ID must never leak"},null
			]}}
		}`, &corridor))
		require.NoError(t, PublicACUPricingCorridor(corridor))
		price := corridor["pricing"].(map[string]interface{})["model"].(map[string]interface{})
		routes := price["routes"].([]interface{})
		require.Len(t, routes, 1)
		route := routes[0].(map[string]interface{})
		if previousID != "" {
			assert.Equal(t, previousID, route["executionProfileId"])
		}
		previousID = route["executionProfileId"].(string)
		expectedNotes := map[string]string{}
		require.NoError(t, common.UnmarshalJsonStr(notes, &expectedNotes))
		assert.Equal(t, expectedNotes["provider:model:messages"], route["publicNote"])
		assert.Equal(t, 1.5, route["payable"].(map[string]interface{})["cacheWriteCnyPerMillion"])
		assert.Regexp(t, `^line-[0-9a-f]{8}$`, route["executionProfileId"])
		assert.Equal(t, "5959", route["lineCode"])
	}
}
