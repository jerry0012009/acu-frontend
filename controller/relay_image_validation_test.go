package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRelayReturnsBadRequestForInvalidImageCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPost,
		"/v1/images/generations",
		strings.NewReader(fmt.Sprintf(
			`{"model":"gpt-image-2.5-sunburst","prompt":"test","n":%d}`,
			dto.MaxImageN+1,
		)),
	)
	context.Request.Header.Set("Content-Type", "application/json")

	Relay(context, types.RelayFormatOpenAIImage)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "n must be an integer between 1 and 5")
}
