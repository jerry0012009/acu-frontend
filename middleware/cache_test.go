package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCacheOnlyUsesLongLivedCachingForStaticAssets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(Cache())
	engine.GET("/static/app.js", func(c *gin.Context) {
		c.String(http.StatusOK, "javascript")
	})
	engine.GET("/keys", func(c *gin.Context) {
		c.String(http.StatusOK, "html")
	})

	staticRequest := httptest.NewRequest(http.MethodGet, "/static/app.js?v=1", nil)
	staticResponse := httptest.NewRecorder()
	engine.ServeHTTP(staticResponse, staticRequest)
	require.Equal(t, http.StatusOK, staticResponse.Code)
	assert.Equal(t, "max-age=604800", staticResponse.Header().Get("Cache-Control"))

	pageRequest := httptest.NewRequest(http.MethodGet, "/keys", nil)
	pageResponse := httptest.NewRecorder()
	engine.ServeHTTP(pageResponse, pageRequest)
	require.Equal(t, http.StatusOK, pageResponse.Code)
	assert.Equal(t, "no-cache", pageResponse.Header().Get("Cache-Control"))
}
