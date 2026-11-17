package helper

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSystemOneNativeRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name, body string
		valid      bool
	}{
		{"native", `{"model":"typesafe/jev-1.14","state":{"ticket":"refund"},"questions":{"q":{"type":"noul","instructions":"Refund requested"}},"extra":{"zero":0,"flag":false}}`, true},
		{"automatic", `{"model":"acu-auto","state":"x","questions":{"q":{}}}`, false},
		{"router", `{"model":"typesafe/jev-router","state":"x","questions":{"q":{}}}`, false},
		{"stream", `{"model":"typesafe/jev-1.14","state":"x","questions":{"q":{}},"stream":true}`, false},
		{"no-state", `{"model":"typesafe/jev-1.14","questions":{"q":{}}}`, false},
		{"no-questions", `{"model":"typesafe/jev-1.14","state":"x","questions":{}}`, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/systemone", strings.NewReader(tc.body))
			c.Request.Header.Set("Content-Type", "application/json")
			request, err := GetAndValidateRequest(c, types.RelayFormatSystemOne)
			if !tc.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.False(t, request.IsStream(c))
			assert.Equal(t, tc.body, request.GetTokenCountMeta().CombineText)
			storage, err := common.GetBodyStorage(c)
			require.NoError(t, err)
			body, err := storage.Bytes()
			require.NoError(t, err)
			assert.Equal(t, tc.body, string(body))
		})
	}
}
