package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsImageGenerationModelRecognizesGPTImageFamily(t *testing.T) {
	assert.True(t, IsImageGenerationModel("gpt-image-2"))
	assert.True(t, IsImageGenerationModel("gpt-image-2.5-flare"))
	assert.True(t, IsImageGenerationModel("gpt-image-2.5-sunburst-2026-09-08"))
	assert.False(t, IsImageGenerationModel("gpt-5.6-luna"))
	assert.False(t, IsImageGenerationModel("proxy-gpt-image-2"))
}
