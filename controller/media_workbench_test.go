package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMediaCapabilitiesRespectProviderLimits(t *testing.T) {
	mini := mediaModelCapability("doubao-seedance-2.0-mini", "video")
	assert.Equal(t, 4, mini.MinSeconds)
	assert.Equal(t, 15, mini.MaxSeconds)
	assert.NotContains(t, mini.Resolutions, "1080p")
	pro := mediaModelCapability("doubao-seedance-2.5", "video")
	assert.Equal(t, 30, pro.MaxSeconds)
	assert.Equal(t, 10, pro.MaxVideos)
	assert.True(t, pro.FrameModes)
}

func TestMediaAssetRequiresUnexpiredSignedAddress(t *testing.T) {
	t.Setenv("ACU_QUICK_START_MEDIA_DIR", t.TempDir())
	dir := mediaAssetDir(12)
	require.NoError(t, os.MkdirAll(dir, 0750))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "upload-test.png"), []byte("fixture"), 0600))
	r := gin.New()
	r.GET("/pg/assets/:user/:name", GetMediaWorkbenchAsset)
	expires := strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10)
	for _, tc := range []struct {
		signature string
		status    int
	}{{mediaAssetSignature(12, "upload-test.png", expires), 200}, {"wrong", 403}} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/pg/assets/12/upload-test.png?expires="+expires+"&signature="+tc.signature, nil))
		assert.Equal(t, tc.status, w.Code)
	}
	past := strconv.FormatInt(time.Now().Add(-time.Hour).Unix(), 10)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/pg/assets/12/upload-test.png?expires="+past+"&signature="+mediaAssetSignature(12, "upload-test.png", past), nil))
	assert.Equal(t, 403, w.Code)
}
