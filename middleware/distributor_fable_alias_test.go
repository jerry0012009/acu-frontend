package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestFableAliasesSelectCanonicalACUChannelAndPreserveWireFields(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB, previousCache := model.DB, common.MemoryCacheEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	model.DB, common.MemoryCacheEnabled = db, true
	t.Cleanup(func() {
		model.DB, common.MemoryCacheEnabled = previousDB, previousCache
		if previousDB != nil && previousCache {
			model.InitChannelCache()
		}
	})
	tag := constant.ChannelTagACURouter
	require.NoError(t, db.Create(&model.Channel{Id: 401, Type: constant.ChannelTypeOpenAI,
		Status: common.ChannelStatusEnabled, Key: "fixture-only", Name: "acu-fable",
		Models: "claude-fable-5,claude-fable-5-1", Group: "default", Tag: &tag}).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 402, Type: constant.ChannelTypeAnthropic,
		Status: common.ChannelStatusEnabled, Key: "fixture-only", Name: "acu-fable-messages",
		Models: "claude-fable-5,claude-fable-5-1", Group: "default", Tag: &tag}).Error)
	for _, name := range []string{"claude-fable-5", "claude-fable-5-1"} {
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: name, ChannelId: 401, Enabled: true}).Error)
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: name, ChannelId: 402, Enabled: true}).Error)
	}
	model.InitChannelCache()
	for _, path := range []string{"/v1/chat/completions", "/v1/messages", "/v1/responses"} {
		for _, tc := range []struct{ input, canonical string }{
			{"claude-fable-5.1", "claude-fable-5-1"}, {"claude-5-fable", "claude-fable-5"},
			{"claude-fable-5-1", "claude-fable-5-1"},
		} {
			t.Run(path+"/"+tc.input, func(t *testing.T) {
				router := gin.New()
				router.Use(func(c *gin.Context) {
					defer common.CleanupBodyStorage(c)
					common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
					common.SetContextKey(c, constant.ContextKeyTokenModelLimitEnabled, true)
					common.SetContextKey(c, constant.ContextKeyTokenModelLimit, map[string]bool{tc.canonical: true})
					c.Next()
				})
				router.POST(path, Distribute(), func(c *gin.Context) {
					channelID := 401
					if path == "/v1/messages" {
						channelID = 402
					}
					assert.Equal(t, channelID, common.GetContextKeyInt(c, constant.ContextKeyChannelId))
					assert.Equal(t, tc.canonical, c.GetString("original_model"))
					storage, err := common.GetBodyStorage(c)
					require.NoError(t, err)
					data, err := storage.Bytes()
					require.NoError(t, err)
					wire, err := io.ReadAll(c.Request.Body)
					require.NoError(t, err)
					assert.Equal(t, data, wire)
					assert.Contains(t, string(data), "9007199254740993", "unknown fields must not lose integer precision")
					assert.JSONEq(t, `{"model":"`+tc.canonical+`","messages":[{"role":"user","content":"fixture"}],"input":"fixture","max_tokens":128,"stream":true,"tools":[{"type":"function","function":{"name":"check"}}],"vendor":{"enabled":false,"zero":0,"large":9007199254740993}}`, string(data))
					assert.Equal(t, int64(len(data)), c.Request.ContentLength)
					c.Status(http.StatusNoContent)
				})
				body := `{"model":"` + tc.input + `","messages":[{"role":"user","content":"fixture"}],"input":"fixture","max_tokens":128,"stream":true,"tools":[{"type":"function","function":{"name":"check"}}],"vendor":{"enabled":false,"zero":0,"large":9007199254740993}}`
				req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				router.ServeHTTP(response, req)
				assert.Equal(t, http.StatusNoContent, response.Code, response.Body.String())
			})
		}
	}
	for _, tc := range []struct{ name, group, path string }{
		{"claude-fable-5.1", "unconfigured", "/v1/chat/completions"},
		{"claude-fable-5.1", "default", "/v1/images/generations"},
		{"claude-fable-5.2", "default", "/v1/chat/completions"},
	} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(`{"model":"`+tc.name+`"}`))
		c.Request.Header.Set("Content-Type", "application/json")
		common.SetContextKey(c, constant.ContextKeyUsingGroup, tc.group)
		parsed, err := getModelFromJSONBody(c)
		require.NoError(t, err)
		assert.Equal(t, tc.name, parsed.Model, "no rewrite without an explicit supported ACU alias and supply")
		common.CleanupBodyStorage(c)
	}
}
