package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebFallbackRejectsMissingStaticAssetsWithoutCaching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.Cache())
	engine.NoRoute(webFallbackHandler([]byte("<html>console</html>")))

	request := httptest.NewRequest(http.MethodGet, "/static/js/async/missing.js", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	require.Equal(t, http.StatusNotFound, response.Code)
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	assert.Contains(t, response.Header().Get("Content-Type"), "application/json")
	assert.NotContains(t, response.Body.String(), "<html>console</html>")
}

func TestWebFallbackKeepsClientRoutesUncached(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(middleware.Cache())
	engine.NoRoute(webFallbackHandler([]byte("<html>console</html>")))

	request := httptest.NewRequest(http.MethodGet, "/keys", nil)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, "no-cache", response.Header().Get("Cache-Control"))
	assert.Equal(t, "text/html; charset=utf-8", response.Header().Get("Content-Type"))
	assert.Equal(t, "<html>console</html>", response.Body.String())
}
