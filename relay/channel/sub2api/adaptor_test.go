package sub2api

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLAlphaSearch(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeSub2API,
			ChannelBaseUrl: "https://sub2api.example",
		},
		RequestURLPath: "/v1/alpha/search",
		RelayMode:      relayconstant.RelayModeAlphaSearch,
	}

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://sub2api.example/v1/alpha/search", url)
}

func TestImageChatBridgeUsesImagesEndpoint(t *testing.T) {
	adaptor := &Adaptor{}
	info := imageChatRelayInfo()

	url, err := adaptor.GetRequestURL(info)

	require.NoError(t, err)
	assert.Equal(t, "https://sub2api.example/v1/images/generations", url)
}

func TestImageChatBridgeConvertsLastUserMessage(t *testing.T) {
	adaptor := &Adaptor{}
	info := imageChatRelayInfo()
	n := 2
	request := &dto.GeneralOpenAIRequest{
		Model: "gpt-image-2",
		N:     &n,
		Size:  "1024x1024",
		Messages: []dto.Message{
			{Role: "user", Content: "first prompt"},
			{Role: "assistant", Content: "intermediate reply"},
			{Role: "user", Content: []any{
				map[string]any{"type": "text", "text": "  final image prompt  "},
			}},
		},
	}

	converted, err := adaptor.ConvertOpenAIRequest(nil, info, request)

	require.NoError(t, err)
	imageRequest, ok := converted.(*dto.ImageRequest)
	require.True(t, ok)
	assert.Equal(t, "gpt-image-2", imageRequest.Model)
	assert.Equal(t, "final image prompt", imageRequest.Prompt)
	assert.Equal(t, "1024x1024", imageRequest.Size)
	require.NotNil(t, imageRequest.N)
	assert.Equal(t, uint(2), *imageRequest.N)
	assert.Equal(t, types.RelayFormat(types.RelayFormatOpenAIImage), info.FinalRequestRelayFormat)
}

func TestImageChatHandlerReturnsNonStreamingChatCompletion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set(common.RequestIdKey, "image-chat-test")

	info := imageChatRelayInfo()
	info.PriceData = types.PriceData{
		UsePrice:   true,
		ModelPrice: common.ImageDefaultPriceUSD,
	}
	body := imageResponseBody(t, "iVBORw0KGgo=", completeImageUsage())
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(bytes.NewReader(body)),
	}

	usage, apiErr := imageChatHandler(ctx, resp, info)

	require.Nil(t, apiErr)
	require.Equal(t, 21, usage.PromptTokens)
	require.Equal(t, 515, usage.CompletionTokens)
	assert.Equal(t, 1, info.ImageResponseCount)
	assert.Equal(t, float64(1), info.PriceData.OtherRatios()["n"])
	assert.False(t, info.ImageBillingFallback)

	var response dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Choices, 1)
	assert.Equal(t, "chat.completion", response.Object)
	assert.Equal(t, "gpt-image-2", response.Model)
	assert.Equal(t, "assistant", response.Choices[0].Message.Role)
	assert.Contains(t, response.Choices[0].Message.StringContent(), "![image_1](data:image/png;base64,")
	assert.Equal(t, 21, response.Usage.PromptTokens)
	assert.Equal(t, 515, response.Usage.CompletionTokens)
}

func TestImageChatHandlerReturnsStreamingChatCompletion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set(common.RequestIdKey, "image-chat-stream-test")

	info := imageChatRelayInfo()
	info.IsStream = true
	info.ShouldIncludeUsage = true
	body := imageResponseBody(t, "", completeImageUsage())
	var upstream imageChatResponse
	require.NoError(t, common.Unmarshal(body, &upstream))
	upstream.Data = []dto.ImageData{{Url: "https://images.example/generated.png"}}
	body, err := common.Marshal(upstream)
	require.NoError(t, err)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(bytes.NewReader(body)),
	}

	usage, apiErr := imageChatHandler(ctx, resp, info)

	require.Nil(t, apiErr)
	require.Equal(t, 536, usage.TotalTokens)
	assert.Equal(t, "text/event-stream", recorder.Header().Get("Content-Type"))
	assert.Contains(t, recorder.Body.String(), "chat.completion.chunk")
	assert.Contains(t, recorder.Body.String(), "![image_1](https://images.example/generated.png)")
	assert.Contains(t, recorder.Body.String(), `"prompt_tokens":21`)
	assert.Contains(t, recorder.Body.String(), "data: [DONE]")
}

func TestImageChatHandlerUsesFallbackPriceForIncompleteUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set(common.RequestIdKey, "image-chat-fallback-test")

	info := imageChatRelayInfo()
	info.PriceData = types.PriceData{
		UsePrice:   true,
		ModelPrice: common.ImageDefaultPriceUSD,
	}
	body := imageResponseBody(t, "iVBORw0KGgo=", dto.Usage{})
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(body)),
	}

	_, apiErr := imageChatHandler(ctx, resp, info)

	require.Nil(t, apiErr)
	assert.True(t, info.ImageBillingFallback)
	assert.Equal(t, common.ImageFallbackPriceUSD, info.PriceData.ModelPrice)
	assert.Equal(t, "upstream image usage was incomplete", info.ImageBillingFallbackReason)
}

func imageChatRelayInfo() *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		RelayFormat:     types.RelayFormatOpenAI,
		OriginModelName: "gpt-image-2",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeSub2API,
			ChannelBaseUrl: "https://sub2api.example",
		},
	}
}

func completeImageUsage() dto.Usage {
	return dto.Usage{
		InputTokens:  21,
		OutputTokens: 515,
		TotalTokens:  536,
		InputTokensDetails: &dto.InputTokenDetails{
			TextTokens: 21,
		},
		OutputTokensDetails: &dto.OutputTokenDetails{
			ImageTokens: 515,
		},
	}
}

func imageResponseBody(t *testing.T, b64 string, usage dto.Usage) []byte {
	t.Helper()
	response := imageChatResponse{
		Created: 1789990961,
		Data: []dto.ImageData{
			{B64Json: strings.TrimSpace(b64)},
		},
		Usage: usage,
	}
	body, err := common.Marshal(response)
	require.NoError(t, err)
	return body
}
