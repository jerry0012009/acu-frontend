package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type runtimeReleaseTransport struct{}

func (runtimeReleaseTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body: io.NopCloser(strings.NewReader(`{"tag_name":"v0.1.99","assets":[
		{"name":"ACU-Runtime-0.1.99-windows-amd64-Setup.exe","state":"uploaded","browser_download_url":"https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.99/ACU-Runtime-0.1.99-windows-amd64-Setup.exe"}]}`)),
		Request: req,
	}, nil
}

func TestRuntimeReleasePublicEndpoints(t *testing.T) {
	previous := http.DefaultTransport
	http.DefaultTransport = runtimeReleaseTransport{}
	t.Cleanup(func() { http.DefaultTransport = previous })
	router := gin.New()
	router.GET("/release", GetRuntimeRelease)
	router.GET("/download/:platform", DownloadRuntime)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/release", nil))
	require.Equal(t, http.StatusOK, response.Code)
	var result struct {
		Success bool                   `json:"success"`
		Data    service.RuntimeRelease `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.True(t, result.Success)
	assert.Equal(t, "0.1.99", result.Data.Version)
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))

	for _, tc := range []struct {
		platform string
		status   int
		location string
	}{
		{"windows", http.StatusFound, "https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.99/ACU-Runtime-0.1.99-windows-amd64-Setup.exe"},
		{"mac-arm", http.StatusFound, service.RuntimeLatestReleaseURL},
		{"mac-intel", http.StatusFound, service.RuntimeLatestReleaseURL},
		{"other", http.StatusNotFound, ""},
	} {
		t.Run(tc.platform, func(t *testing.T) {
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/download/"+tc.platform, nil))
			assert.Equal(t, tc.status, response.Code)
			assert.Equal(t, tc.location, response.Header().Get("Location"))
			assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
		})
	}
}
