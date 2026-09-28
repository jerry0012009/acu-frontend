package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newChatEOFTestContext(t *testing.T, body string) (*gin.Context, *httptest.ResponseRecorder, *http.Response, *relaycommon.RelayInfo) {
	t.Helper()

	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(common.RequestIdKey, "chat-eof-test")

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-test",
		},
		IsStream:    true,
		RelayMode:   relayconstant.RelayModeChatCompletions,
		RelayFormat: types.RelayFormatOpenAI,
		DisablePing: true,
	}
	return c, recorder, resp, info
}

func TestOaiStreamHandlerRepairsEOFWithoutFinishReason(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	body := strings.Join([]string{
		`data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1710000000,"model":"gpt-test","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
		`data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1710000000,"model":"gpt-test","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}`,
		``,
	}, "\n")

	c, recorder, resp, info := newChatEOFTestContext(t, body)
	_, apiErr := OaiStreamHandler(c, info, resp)
	require.Nil(t, apiErr)

	got := recorder.Body.String()
	require.Equal(t, relaycommon.StreamEndReasonEOF, info.StreamStatus.EndReason)
	require.Contains(t, got, `"content":"hello"`)
	require.Equal(t, 1, strings.Count(got, `"finish_reason":"stop"`))
	require.Contains(t, got, `data: [DONE]`)
	requireOrderedSubstrings(t, got,
		`"content":"hello"`,
		`"finish_reason":"stop"`,
		`data: [DONE]`,
	)
}

func TestOaiStreamHandlerRepairsToolCallEOFWithToolFinishReason(t *testing.T) {
	body := strings.Join([]string{
		`data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1710000000,"model":"gpt-test","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\"q\":\"x\"}"}}]},"finish_reason":null}]}`,
		``,
	}, "\n")

	c, recorder, resp, info := newChatEOFTestContext(t, body)
	_, apiErr := OaiStreamHandler(c, info, resp)
	require.Nil(t, apiErr)

	got := recorder.Body.String()
	require.Equal(t, relaycommon.StreamEndReasonEOF, info.StreamStatus.EndReason)
	require.Equal(t, 1, strings.Count(got, `"finish_reason":"tool_calls"`))
	require.Contains(t, got, `data: [DONE]`)
}

func TestOaiStreamHandlerDoesNotDuplicateExistingFinishReasonOnEOF(t *testing.T) {
	body := strings.Join([]string{
		`data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1710000000,"model":"gpt-test","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}`,
		`data: {"id":"chatcmpl_1","object":"chat.completion.chunk","created":1710000000,"model":"gpt-test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
		``,
	}, "\n")

	c, recorder, resp, info := newChatEOFTestContext(t, body)
	_, apiErr := OaiStreamHandler(c, info, resp)
	require.Nil(t, apiErr)

	got := recorder.Body.String()
	require.Equal(t, relaycommon.StreamEndReasonEOF, info.StreamStatus.EndReason)
	require.Equal(t, 1, strings.Count(got, `"finish_reason":"stop"`))
	require.Contains(t, got, `data: [DONE]`)
}

func TestOaiStreamHandlerDoesNotRepairReadErrorAsSuccessfulEOF(t *testing.T) {
	body := "data: {\"id\":\"partial\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"partial\"},\"finish_reason\":null}]}\n\n"
	c, recorder, resp, info := newChatEOFTestContext(t, body)
	resp.Body = io.NopCloser(io.MultiReader(strings.NewReader(body), iotest.ErrReader(io.ErrUnexpectedEOF)))
	_, _ = OaiStreamHandler(c, info, resp)
	require.NotEqual(t, relaycommon.StreamEndReasonEOF, info.StreamStatus.EndReason)
	require.NotContains(t, recorder.Body.String(), `"finish_reason":"stop"`)
}
