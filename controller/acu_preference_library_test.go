package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestPreferenceReadModelsRequireDashboardSessionNotJustUserID(t *testing.T) {
	for _, handler := range []gin.HandlerFunc{GetPrivateACUPreferenceLibrary, GetPrivateACUPreferenceActivity} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
		c.Set("id", 42)
		handler(c)
		assert.Equal(t, http.StatusForbidden, w.Code)
		assert.Contains(t, w.Body.String(), "AUTH_SESSION_REQUIRED")
	}
}
