package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConversationModelListUsesConfigurationNotMonitoring(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	token := model.Token{UserId: 77, Key: "fast-list-test-key", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true, ModelLimitsEnabled: true, ModelLimits: "allowed,disabled", ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"allowed-profile", "disabled-profile"}}
	require.NoError(t, db.Create(&token).Error)
	tag := constant.ChannelTagACURouter
	channel := model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "fixture", Name: "ACU", Models: "allowed,disabled,denied", Group: "default", Tag: &tag}
	require.NoError(t, db.Create(&channel).Error)
	for _, id := range []string{"allowed", "disabled", "denied", "acu-auto"} {
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: id, ChannelId: channel.Id, Enabled: true}).Error)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/internal/admin/execution-profiles", r.URL.Path, "model picker must not request monitoring/history")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"profiles":[{"executionProfileId":"allowed-profile","modelId":"allowed","routingEnabled":true,"protocols":["messages"]},{"executionProfileId":"duplicate","modelId":"allowed","routingEnabled":true,"protocols":["responses"]},{"executionProfileId":"disabled-profile","modelId":"disabled","routingEnabled":false,"protocols":["messages"]},{"executionProfileId":"denied-profile","modelId":"denied","routingEnabled":true,"protocols":["responses"]}]}`))
	}))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "fixture")
	router := gin.New()
	router.GET("/options", func(c *gin.Context) { c.Set("id", 77); c.Set("user_group", "default"); GetACUConversationOptions(c) })
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/options", nil))
	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Models []acuConversationModelResponse `json:"models"`
			Error  string                         `json:"models_error"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &result))
	require.True(t, result.Success)
	require.Empty(t, result.Data.Error)
	require.Equal(t, []acuConversationModelResponse{{Label: "acu-auto", Value: "acu-auto"}, {Label: "allowed", Value: "allowed"}}, result.Data.Models)
}

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
