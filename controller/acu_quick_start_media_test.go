package controller

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUploadAcuQuickStartMediaStoresDetectedImage(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_QUICK_START_MEDIA_DIR", t.TempDir())

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "step.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/api/option/acu-quick-start-media", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-Forwarded-Host", "console.acucompute.com")
	request.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	UploadAcuQuickStartMedia(context)

	assert.Equal(t, http.StatusOK, response.Code)
	files, err := os.ReadDir(acuQuickStartMediaDir())
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.Equal(t, ".png", filepath.Ext(files[0].Name()))
	assert.Contains(t, response.Body.String(), "https://console.acucompute.com/api/acu-quick-start/media/")
}

func TestUploadAcuQuickStartMediaRejectsUnknownContent(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_QUICK_START_MEDIA_DIR", t.TempDir())

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "payload.svg")
	require.NoError(t, err)
	_, err = part.Write([]byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	request := httptest.NewRequest(http.MethodPost, "/api/option/acu-quick-start-media", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	UploadAcuQuickStartMedia(context)

	assert.Equal(t, http.StatusBadRequest, response.Code)
	files, err := os.ReadDir(acuQuickStartMediaDir())
	require.NoError(t, err)
	assert.Empty(t, files)
}

func TestValidAcuQuickStartMediaFilenameRejectsTraversal(t *testing.T) {
	assert.True(t, validAcuQuickStartMediaFilename("0123456789abcdef0123456789abcdef.mp4"))
	assert.False(t, validAcuQuickStartMediaFilename("../0123456789abcdef0123456789abcdef.mp4"))
	assert.False(t, validAcuQuickStartMediaFilename("not-random.mp4"))
	assert.False(t, validAcuQuickStartMediaFilename("0123456789abcdef0123456789abcdef.svg"))
}

func TestPruneAcuQuickStartMediaFilesRemovesUnreferencedUploads(t *testing.T) {
	directory := t.TempDir()
	t.Setenv("ACU_QUICK_START_MEDIA_DIR", directory)
	kept := "0123456789abcdef0123456789abcdef.png"
	removed := "abcdef0123456789abcdef0123456789.mp4"
	require.NoError(t, os.WriteFile(filepath.Join(directory, kept), []byte("keep"), 0640))
	require.NoError(t, os.WriteFile(filepath.Join(directory, removed), []byte("remove"), 0640))

	mediaJSON := `[{"type":"image","url":"https://console.acucompute.com/api/acu-quick-start/media/` + kept + `"}]`
	require.NoError(t, pruneAcuQuickStartMediaFiles(mediaJSON))

	_, err := os.Stat(filepath.Join(directory, kept))
	assert.NoError(t, err)
	_, err = os.Stat(filepath.Join(directory, removed))
	assert.True(t, errors.Is(err, os.ErrNotExist))
}
