package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRequiredPublicChannelTagForChatCompletionsIsAlwaysACURouter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())

	require.Equal(t, constant.ChannelTagACURouter, RequiredPublicChannelTag(
		context, "default", "gpt-ordinary", "/v1/chat/completions",
	))
	require.Equal(t, "", RequiredPublicChannelTag(
		context, "default", "gpt-ordinary", "/pg/chat/completions",
	))
	require.Equal(t, "", RequiredPublicChannelTag(
		context, "default", "gpt-ordinary", "/v1/responses",
	))
}
