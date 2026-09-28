package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSendEmailVerificationRejectsBlacklistedDomain(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousEnabled := common.EmailDomainBlacklistEnabled
	previousBlacklist := common.EmailDomainBlacklist
	common.EmailDomainBlacklistEnabled = true
	common.EmailDomainBlacklist = []string{"2925.com"}
	t.Cleanup(func() {
		common.EmailDomainBlacklistEnabled = previousEnabled
		common.EmailDomainBlacklist = previousBlacklist
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/verification?email=blocked%402925.com",
		nil,
	)

	context.Request.Header.Set("Accept-Language", "zh-CN")
	SendEmailVerification(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(
		t,
		`{"success":false,"message":"该邮箱域名不允许注册，请更换其他邮箱后重试。"}`,
		recorder.Body.String(),
	)
}
