package relay

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestACURawHeartbeatBeforeHeadersAndLateError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	service.InitHttpClient()
	settings := operation_setting.GetGeneralSetting()
	previousEnabled, previousSeconds := settings.PingIntervalEnabled, settings.PingIntervalSeconds
	settings.PingIntervalEnabled, settings.PingIntervalSeconds = true, 1
	t.Cleanup(func() { settings.PingIntervalEnabled, settings.PingIntervalSeconds = previousEnabled, previousSeconds })
	for _, status := range []int{200, 429} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			release := make(chan struct{})
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				io.Copy(io.Discard, r.Body)
				select {
				case <-release:
				case <-r.Context().Done():
					return
				}
				if status == 429 {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(status)
					io.WriteString(w, `{"error":{"message":"rate limited","code":"rate_limit"}}`)
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				io.WriteString(w, "event: response.completed\ndata: {\"type\":\"response.completed\"}\n\n")
			}))
			defer up.Close()
			result := make(chan *types.NewAPIError, 1)
			gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				c, _ := gin.CreateTestContext(w)
				c.Request = r
				common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
				common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, up.URL)
				common.SetContextKey(c, constant.ContextKeyChannelKey, "test-router-key")
				result <- ACURawHelper(c, &relaycommon.RelayInfo{IsACUChannel: true, IsStream: true, UserId: 17, TokenId: 29, RequestId: "req_ping", RequestURLPath: "/v1/responses"})
			}))
			defer gateway.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, "POST", gateway.URL+"/v1/responses", strings.NewReader(`{"model":"m","input":"hello","stream":true}`))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			// Always release the fake upstream even when the old implementation
			// waits without sending headers and the request deadline expires.
			if err != nil {
				close(release)
				t.Fatal(err)
			}
			defer resp.Body.Close()
			reader := bufio.NewReader(resp.Body)
			line, err := reader.ReadString('\n')
			close(release)
			require.NoError(t, err)
			require.Equal(t, ": PING\n", line)
			require.Equal(t, "no", resp.Header.Get("X-Accel-Buffering"))
			tail, err := io.ReadAll(reader)
			require.NoError(t, err)
			relayErr := <-result
			if status == 200 {
				require.Nil(t, relayErr)
				require.Contains(t, string(tail), "event: response.completed")
			} else {
				require.NotNil(t, relayErr)
				require.Equal(t, 429, relayErr.StatusCode)
				require.Contains(t, string(tail), "event: error\n")
				require.Contains(t, string(tail), `"status_code":429`)
				require.Contains(t, string(tail), "rate limited")
				require.NotContains(t, string(tail), "response.completed")
			}
		})
	}
}

func TestACURawClientCancellationIsNotProvider500(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	service.InitHttpClient()
	for _, headersFirst := range []bool{false, true} {
		t.Run(fmt.Sprint(headersFirst), func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				io.Copy(io.Discard, r.Body)
				if headersFirst {
					w.Header().Set("Content-Type", "text/event-stream")
					w.WriteHeader(200)
					io.WriteString(w, ": first\n")
					w.(http.Flusher).Flush()
				} else {
					cancel()
				}
				<-r.Context().Done()
			}))
			defer up.Close()
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(acuCancelWriter{rec, cancel})
			c.Request = httptest.NewRequest("POST", "/v1/responses", strings.NewReader(`{"model":"m","input":"hello","stream":true}`)).WithContext(ctx)
			c.Request.Header.Set("Content-Type", "application/json")
			common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
			common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, up.URL)
			common.SetContextKey(c, constant.ContextKeyChannelKey, "test-router-key")
			got := ACURawHelper(c, &relaycommon.RelayInfo{IsACUChannel: true, IsStream: true, UserId: 17, TokenId: 29, RequestId: "req_cancel", RequestURLPath: "/v1/responses"})
			require.NotNil(t, got)
			require.Equal(t, 499, got.StatusCode)
			require.Equal(t, types.ErrorCodeClientCancelled, got.GetErrorCode())
			require.True(t, types.IsSkipRetryError(got))
			require.False(t, service.ShouldDisableChannel(got))
			if headersFirst {
				require.Contains(t, rec.Body.String(), ": first")
			}
		})
	}
}

type acuCancelWriter struct {
	*httptest.ResponseRecorder
	cancel context.CancelFunc
}

func (w acuCancelWriter) Write(b []byte) (int, error) {
	n, err := w.ResponseRecorder.Write(b)
	w.cancel()
	return n, err
}

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
