package helper

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImageChatRequestBoundsImageCount(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name    string
		n       int
		wantErr bool
	}{
		{name: "maximum accepted", n: dto.MaxImageN},
		{name: "above maximum rejected", n: dto.MaxImageN + 1, wantErr: true},
		{name: "zero rejected", n: 0, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := fmt.Sprintf(
				`{"model":"gpt-image-2","messages":[{"role":"user","content":"draw a circle"}],"n":%d}`,
				tt.n,
			)
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", bytes.NewBufferString(body))
			ctx.Request.Header.Set("Content-Type", "application/json")

			request, err := GetAndValidateTextRequest(ctx, relayconstant.RelayModeChatCompletions)

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "n must be an integer between")
				return
			}
			require.NoError(t, err)
			meta := request.GetTokenCountMeta()
			assert.Equal(t, float64(tt.n), meta.BillingRatios["n"])
		})
	}
}
