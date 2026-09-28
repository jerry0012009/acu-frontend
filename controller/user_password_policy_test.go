package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateSelfPasswordLengthAndAuthentication(t *testing.T) {
	for _, tt := range []struct {
		name, password         string
		wrongCurrent, accepted bool
	}{
		{"change to 32 characters", strings.Repeat("N", 32), false, true},
		{"change to 72 byte unicode password", strings.Repeat("界", 24), false, true},
		{"reject unicode byte overflow", strings.Repeat("界", 25), false, false},
		{"reject incorrect current password", strings.Repeat("N", 32), true, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			previousDB, previousLogDB := model.DB, model.LOG_DB
			previousSecret := common.SessionSecret
			t.Cleanup(func() { model.DB = previousDB; model.LOG_DB = previousLogDB; common.SessionSecret = previousSecret })
			db := setupModelListControllerTestDB(t)
			require.NoError(t, db.AutoMigrate(&model.UserSession{}))
			common.SessionSecret = "password-policy-session-test-secret"
			current := strings.Repeat("C", 48)
			hash, err := common.Password2Hash(current)
			require.NoError(t, err)
			user := &model.User{Username: "password-user", Password: hash, Status: common.UserStatusEnabled, Role: common.RoleCommonUser, Group: "default", AuthVersion: 1}
			require.NoError(t, db.Create(user).Error)
			bundle, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "policy-test")
			require.NoError(t, err)
			supplied := current
			if tt.wrongCurrent {
				supplied = "incorrect-current-password"
			}
			body, err := common.Marshal(map[string]string{"original_password": supplied, "password": tt.password})
			require.NoError(t, err)
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPut, "/api/user/self", strings.NewReader(string(body)))
			c.Request.Header.Set("Content-Type", "application/json")
			c.Set("id", user.Id)
			c.Set("session_id", bundle.Session.SID)
			c.Set("auth_version", int64(1))
			c.Set("session_version", int64(1))
			UpdateSelf(c)
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					AccessToken string `json:"access_token"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, tt.accepted, response.Success)
			var stored model.User
			require.NoError(t, db.First(&stored, user.Id).Error)
			if tt.accepted {
				assert.NotEmpty(t, response.Data.AccessToken)
				assert.Equal(t, int64(2), stored.AuthVersion)
				login := model.User{Username: user.Username, Password: tt.password}
				require.NoError(t, login.ValidateAndFill())
				assert.False(t, common.ValidatePasswordAndHash(current, stored.Password))
			} else {
				assert.Equal(t, hash, stored.Password)
				assert.Equal(t, int64(1), stored.AuthVersion)
			}
		})
	}
}
