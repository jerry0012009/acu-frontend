package gemini

import (
	"bytes"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGeminiDrawingRequestPreservesPromptAndReference(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/generations", nil)
	value, err := geminiDrawingRequest(c, nil, dto.ImageRequest{Prompt: "red mug", Size: "16:9", Images: []byte(`[{"image_url":"data:image/png;base64,YWJj"}]`)})
	require.NoError(t, err)
	req := value.(dto.GeminiChatRequest)
	assert.Equal(t, "red mug", req.Contents[0].Parts[0].Text)
	assert.Equal(t, "YWJj", req.Contents[0].Parts[1].InlineData.Data)
	assert.JSONEq(t, `{"aspectRatio":"16:9"}`, string(req.GenerationConfig.ImageConfig))
	n := uint(2)
	_, err = geminiDrawingRequest(c, nil, dto.ImageRequest{N: &n})
	require.Error(t, err)
	_, err = geminiDrawingRequest(c, nil, dto.ImageRequest{Mask: []byte(`"mask"`)})
	require.Error(t, err)
}

func TestGeminiDrawingResponseUsesActualImageAndUsage(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/v1/images/generations", nil)
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gemini-3.1-flash-image-preview"}}
	r := &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewBufferString(`{"candidates":[{"content":{"parts":[{"text":"done"},{"inlineData":{"mimeType":"image/png","data":"YWJj"}}]}}],"usageMetadata":{"promptTokenCount":13,"candidatesTokenCount":1120,"totalTokenCount":1133,"candidatesTokensDetails":[{"modality":"IMAGE","tokenCount":1120}]}}`))}
	u, err := GeminiDrawingHandler(c, info, r)
	require.Nil(t, err)
	require.NotNil(t, u)
	assert.Equal(t, 13, u.PromptTokens)
	assert.Equal(t, 1120, u.CompletionTokens)
	assert.Equal(t, 1, info.ImageResponseCount)
	assert.Contains(t, w.Body.String(), `"b64_json":"YWJj"`)
}
