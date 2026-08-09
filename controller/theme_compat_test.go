package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionRejectsRetiredFrontendTheme(t *testing.T) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/option/",
		strings.NewReader(`{"key":"theme.frontend","value":"classic"}`),
	)

	UpdateOption(context)

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"Classic 前端已移除，主题只能设置为 default"}`, response.Body.String())
}

func TestGetStatusAdvertisesDefaultDashboard(t *testing.T) {
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Equal(t, "default", payload.Data["theme"])
}

func TestPublicServerAddressUsesForwardedConsoleOriginForLocalhostConfig(t *testing.T) {
	previous := system_setting.ServerAddress
	system_setting.ServerAddress = "http://localhost:3000"
	t.Cleanup(func() { system_setting.ServerAddress = previous })

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/acu/api/status", nil)
	context.Request.Header.Set("X-Forwarded-Host", "eu.example.test")
	context.Request.Header.Set("X-Forwarded-Proto", "https")
	context.Request.Header.Set("X-Forwarded-Prefix", "/acu")

	assert.Equal(t, "https://eu.example.test/acu", publicServerAddress(context))
}
