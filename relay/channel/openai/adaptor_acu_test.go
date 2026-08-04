package openai

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
)

func TestConvertOpenAIResponsesRequestPreservesACUVirtualModels(t *testing.T) {
	adaptor := &Adaptor{}

	for _, modelName := range []string{"acu-auto", "acu-high"} {
		t.Run(modelName, func(t *testing.T) {
			converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, &relaycommon.RelayInfo{}, dto.OpenAIResponsesRequest{
				Model: modelName,
			})
			require.NoError(t, err)
			request := converted.(dto.OpenAIResponsesRequest)
			require.Equal(t, modelName, request.Model)
			require.Nil(t, request.Reasoning)
		})
	}
}

func TestConvertOpenAIResponsesRequestStillParsesReasoningSuffix(t *testing.T) {
	adaptor := &Adaptor{}
	converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, &relaycommon.RelayInfo{}, dto.OpenAIResponsesRequest{
		Model: "gpt-5-high",
	})
	require.NoError(t, err)
	request := converted.(dto.OpenAIResponsesRequest)
	require.Equal(t, "gpt-5", request.Model)
	require.Equal(t, "high", request.Reasoning.Effort)
}
