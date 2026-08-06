package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestShouldUseRawClaudeBodyForACU(t *testing.T) {
	original := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	t.Cleanup(func() { model_setting.GetGlobalSettings().PassThroughRequestEnabled = original })
	model_setting.GetGlobalSettings().PassThroughRequestEnabled = false

	require.True(t, shouldUseRawClaudeBody(&relaycommon.RelayInfo{
		IsACUChannel: true,
		RelayFormat:  types.RelayFormatClaude,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelSetting: dto.ChannelSettings{
			PassThroughBodyEnabled: false,
		}},
	}))
	require.False(t, shouldUseRawClaudeBody(&relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatClaude,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelSetting: dto.ChannelSettings{
			PassThroughBodyEnabled: false,
		}},
	}))
}

func TestRelayACUNativeClaudeErrorPreservesStatusAndBody(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name   string
		status int
		body   string
	}{
		{"thinking rejection", http.StatusBadRequest, `{"type":"error","error":{"type":"invalid_request_error","message":"thinking is not supported"}}`},
		{"context error", http.StatusBadRequest, `{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long"}}`},
		{"rate limit", http.StatusTooManyRequests, `{"type":"error","error":{"type":"rate_limit_error","message":"rate limit exceeded"}}`},
		{"router failure", http.StatusServiceUnavailable, `{"type":"error","error":{"type":"api_error","message":"no executable messages profile"}}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			gin.SetMode(gin.TestMode)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			response := &http.Response{
				StatusCode: test.status,
				Header: http.Header{
					"Content-Type":         []string{"application/json"},
					"Anthropic-Request-Id": []string{"req_upstream"},
				},
				Body: io.NopCloser(strings.NewReader(test.body)),
			}
			require.NoError(t, relayACUNativeClaudeError(ctx, response))
			require.Equal(t, test.status, recorder.Code)
			require.JSONEq(t, test.body, recorder.Body.String())
			require.Equal(t, "req_upstream", recorder.Header().Get("Anthropic-Request-Id"))
		})
	}
}
