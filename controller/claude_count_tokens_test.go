package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestCountClaudeTokensSupportsBetaQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/v1/messages/count_tokens", CountClaudeTokens)

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/messages/count_tokens?beta=true",
		strings.NewReader(`{
			"model":"acu-auto",
			"system":"You are concise.",
			"messages":[{"role":"user","content":"Return exactly OK"}],
			"tools":[{
				"name":"lookup",
				"description":"Look up a value",
				"input_schema":{"type":"object","properties":{"id":{"type":"string"}}}
			}]
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Greater(t, gjson.Get(recorder.Body.String(), "input_tokens").Int(), int64(0))
}

func TestCountClaudeTokensReturnsAnthropicError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/messages/count_tokens",
		strings.NewReader(`{"messages":[]}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")

	CountClaudeTokens(context)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "error", gjson.Get(recorder.Body.String(), "type").String())
	require.Equal(t, "invalid_request_error", gjson.Get(recorder.Body.String(), "error.type").String())
	require.Contains(t, gjson.Get(recorder.Body.String(), "error.message").String(), "model")
}
