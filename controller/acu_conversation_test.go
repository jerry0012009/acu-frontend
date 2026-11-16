package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConversationOptionsKeepDefaultKeyWhenModelServiceUnavailable(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	token := model.Token{UserId: 77, Name: "Existing Key", Key: "fixture-private-key", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, db.Create(&token).Error)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "fixture")
	router := gin.New()
	router.GET("/options", func(c *gin.Context) { c.Set("id", 77); c.Set("user_group", "default"); GetACUConversationOptions(c) })
	for _, query := range []string{"", "?token_id=999999", "?include_models=false"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/options"+query, nil))
		var result struct {
			Success bool `json:"success"`
			Data    struct {
				Tokens     []acuConversationTokenResponse `json:"tokens"`
				Selected   int                            `json:"selected_token_id"`
				Models     []acuConversationModelResponse `json:"models"`
				ModelError string                         `json:"models_error"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(w.Body.Bytes(), &result))
		require.True(t, result.Success, w.Body.String())
		require.Len(t, result.Data.Tokens, 1)
		require.Equal(t, token.Id, result.Data.Selected)
		if query == "?include_models=false" {
			require.Empty(t, result.Data.ModelError)
		} else {
			require.NotEmpty(t, result.Data.ModelError)
		}
		require.NotContains(t, w.Body.String(), token.Key)
	}
}
