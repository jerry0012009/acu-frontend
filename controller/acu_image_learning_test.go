package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestImageFeedbackUsesAuthenticatedOwnerAndPreservesHumanText(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/admin/private-acu/image-feedback", r.URL.Path)
		var body map[string]string
		require.NoError(t, common.DecodeJson(r.Body, &body))
		assert.Equal(t, "3", body["userId"])
		assert.Equal(t, "7", body["tokenId"])
		assert.Equal(t, "主车保持实体", body["feedback"])
		_, _ = w.Write([]byte(`{"status":"queued"}`))
	}))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "internal")
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set(string(constant.ContextKeyUserId), 3)
	c.Set(string(constant.ContextKeyTokenId), 7)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"requestId":"image-1","feedback":"主车保持实体","userId":"99","tokenId":"999"}`))
	ImageLearningFeedback(c)
	assert.Equal(t, 202, recorder.Code)
}
