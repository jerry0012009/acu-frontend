package controller

import (
	"bytes"
	"io"
	"mime"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImagePromptRewritePreservesJSONFields(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/generations", bytes.NewBufferString(`{"model":"gpt-image-2","prompt":"original","n":1,"stream":false,"output_compression":0,"images":[{"image_url":"reference"}],"custom":{"untouched":true}}`))
	c.Request.Header.Set("Content-Type", "application/json")
	defer common.CleanupBodyStorage(c)
	require.NoError(t, replaceImagePrompt(c, "original\naddition"))
	storage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, common.DecodeJson(storage, &body))
	assert.Equal(t, "original\naddition", body["prompt"])
	assert.Equal(t, false, body["stream"])
	assert.Equal(t, float64(0), body["output_compression"])
	assert.Equal(t, map[string]any{"untouched": true}, body["custom"])
	assert.Equal(t, []any{map[string]any{"image_url": "reference"}}, body["images"])
}

func TestImagePromptRewritePreservesMultipartOrderAndFiles(t *testing.T) {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	require.NoError(t, w.WriteField("prompt", "original"))
	require.NoError(t, w.WriteField("model", "gpt-image-2"))
	for _, name := range []string{"image[]", "image[]", "mask"} {
		p, err := w.CreateFormFile(name, name+".png")
		require.NoError(t, err)
		_, err = p.Write([]byte{0, 1, 2, 255})
		require.NoError(t, err)
	}
	require.NoError(t, w.WriteField("output_compression", "0"))
	require.NoError(t, w.Close())
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/images/edits", &body)
	c.Request.Header.Set("Content-Type", w.FormDataContentType())
	defer common.CleanupBodyStorage(c)
	require.NoError(t, replaceImagePrompt(c, "new prompt"))
	_, params, err := mime.ParseMediaType(c.Request.Header.Get("Content-Type"))
	require.NoError(t, err)
	storage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	r := multipart.NewReader(storage, params["boundary"])
	var names []string
	for {
		p, err := r.NextPart()
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		names = append(names, p.FormName())
		b, err := io.ReadAll(p)
		require.NoError(t, err)
		if p.FileName() != "" {
			assert.Equal(t, []byte{0, 1, 2, 255}, b)
		}
		if p.FormName() == "prompt" {
			assert.Equal(t, "new prompt", string(b))
		}
	}
	assert.Equal(t, []string{"prompt", "model", "image[]", "image[]", "mask", "output_compression"}, names)
}
