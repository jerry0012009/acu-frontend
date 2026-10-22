package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPublicPricingCorridorHidesInternalRouteIdentityAndUsesPublicNotes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.Create(&model.Token{Id: 1, UserId: 1, Key: "fixture", Status: common.TokenStatusEnabled}).Error)
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{
		"ACUProfilePublicNotes": `{"private-provider:model:messages":"Suitable for long conversations"}`,
	}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"series":{},"pricing":{"model":{
				"executionProfileId":"private-provider:model:messages",
				"provider":"private-provider","channel":"secret-channel","internalNote":"private memo",
				"payableInputPriceCnyPerMillion":1.25,"payableOutputPriceCnyPerMillion":5,
				"routes":[
					{"executionProfileId":"private-provider:model:messages","displayName":"Private Supplier",
					 "provider":"private-provider","endpoint":"https://private.example","internalNote":"private memo",
					 "selected":true,"firstTokenLatencyMs":1200,"firstTokenLatencySource":"probe","firstTokenSampleCount":19,
					 "payable":{"inputCnyPerMillion":1.25,"outputCnyPerMillion":5,"internalNote":"private memo"}},
					{"executionProfileId":"other-provider:model:messages","displayName":"Other Supplier",
					 "publicNote":"untrusted upstream note","selected":false,
					 "payable":{"inputCnyPerMillion":2,"outputCnyPerMillion":8}}
				]
			}}
		}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	var firstID string
	for _, visit := range []struct {
		role  int
		token bool
	}{
		{0, false}, {common.RoleCommonUser, false}, {common.RoleAdminUser, false},
		{common.RoleCommonUser, true}, {common.RoleAdminUser, true},
	} {
		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		c.Set("role", visit.role)
		c.Set("id", 1)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/pricing/acu-selection-corridor?protocol=messages", nil)
		if visit.token {
			c.Params = gin.Params{{Key: "tokenId", Value: "1"}}
			GetACUTokenSelectionCorridor(c)
		} else {
			GetACUSelectionCorridor(c)
		}
		require.Equal(t, http.StatusOK, response.Code)
		for _, private := range []string{"private-provider", "other-provider", "Private Supplier", "Other Supplier", "private.example", "private memo", "secret-channel", "untrusted upstream note"} {
			assert.NotContains(t, response.Body.String(), private)
		}
		var payload struct {
			Data struct {
				Pricing map[string]struct {
					ExecutionProfileID string `json:"executionProfileId"`
					Routes             []struct {
						ID         string  `json:"executionProfileId"`
						Name       string  `json:"displayName"`
						Note       string  `json:"publicNote"`
						Selected   bool    `json:"selected"`
						FirstToken float64 `json:"firstTokenLatencyMs"`
					} `json:"routes"`
				} `json:"pricing"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
		price := payload.Data.Pricing["model"]
		require.Len(t, price.Routes, 2)
		assert.Regexp(t, `^Line [0-9]{4}$`, price.Routes[0].Name)
		assert.Equal(t, price.ExecutionProfileID, price.Routes[0].ID)
		assert.Equal(t, "Suitable for long conversations", price.Routes[0].Note)
		assert.Empty(t, price.Routes[1].Note)
		assert.True(t, price.Routes[0].Selected)
		assert.Equal(t, 1200.0, price.Routes[0].FirstToken)
		if firstID != "" {
			assert.Equal(t, firstID, price.ExecutionProfileID)
		}
		firstID = price.ExecutionProfileID
	}
}
