package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestACURawRelayPreservesFourProtocolsAndErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	service.InitHttpClient()
	for _, tc := range []struct {
		path, body, reply string
		status            int
	}{
		{"/v1/responses", `{"model":"deepseek-v4.1-flash","input":"hello","new_field":false}`, `{"id":"r","output":[]}`, 200},
		{"/v1/chat/completions", `{"model":"acu-auto","messages":[],"temperature":0}`, `{"choices":[]}`, 200},
		{"/v1/messages", `{"model":"deepseek-v4.1-flash","messages":[],"max_tokens":64}`, `{"type":"error","error":{"message":"bad tool"}}`, 400},
		{"/v1beta/models/acu-auto:streamGenerateContent?alt=sse", `{"contents":[{"role":"user","parts":[{"text":"hello"}]}],"unknown":true}`, "data: {\"candidates\":[]}\n\n", 200},
	} {
		t.Run(tc.path, func(t *testing.T) {
			calls := 0
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				b, err := io.ReadAll(r.Body)
				require.NoError(t, err)
				require.Equal(t, tc.body, string(b))
				require.Equal(t, tc.path, r.URL.RequestURI())
				require.NotEmpty(t, r.Header.Get("X-ACU-Signature"))
				w.Header().Set("Content-Type", "application/json")
				if strings.Contains(tc.path, "streamGenerateContent") {
					w.Header().Set("Content-Type", "text/event-stream")
				}
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.reply)
			}))
			defer up.Close()
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest("POST", tc.path, strings.NewReader(tc.body))
			ctx.Request.Header.Set("Content-Type", "application/json")
			common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
			common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, up.URL)
			common.SetContextKey(ctx, constant.ContextKeyChannelKey, "test-router-key")
			info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: "req_raw", RequestURLPath: tc.path}
			require.Nil(t, ACURawHelper(ctx, info))
			require.Equal(t, tc.status, rec.Code)
			require.Equal(t, tc.reply, rec.Body.String())
			require.Equal(t, 1, calls)
		})
	}
}
