package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckACUAdmissionRequiredQuotaBoundaries(t *testing.T) {
	setupACUFinalizeTestDB(t)
	previousPreConsumedQuota := common.PreConsumedQuota
	common.PreConsumedQuota = 500
	t.Cleanup(func() { common.PreConsumedQuota = previousPreConsumedQuota })

	tests := []struct {
		name           string
		userQuota      int
		tokenQuota     int
		unlimitedToken bool
		wantCode       types.ErrorCode
	}{
		{name: "zero wallet", userQuota: 0, tokenQuota: 500, wantCode: types.ErrorCodeInsufficientUserQuota},
		{name: "wallet below required", userQuota: 499, tokenQuota: 500, wantCode: types.ErrorCodeInsufficientUserQuota},
		{name: "wallet at required", userQuota: 500, tokenQuota: 500},
		{name: "limited token below required", userQuota: 500, tokenQuota: 499, wantCode: types.ErrorCodePreConsumeTokenQuotaFailed},
		{name: "unlimited token ignores remaining quota", userQuota: 500, tokenQuota: 0, unlimitedToken: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			user := model.User{Username: "user-" + test.name, Password: "test-password", Status: common.UserStatusEnabled, Quota: test.userQuota, AffCode: "aff-" + test.name}
			require.NoError(t, model.DB.Create(&user).Error)
			token := model.Token{UserId: user.Id, Key: "token-" + test.name, Name: test.name, Status: common.TokenStatusEnabled, RemainQuota: test.tokenQuota, UnlimitedQuota: test.unlimitedToken}
			require.NoError(t, model.DB.Create(&token).Error)
			info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: user.Id, TokenId: token.Id}

			err := CheckACUAdmission(nil, info)
			if test.wantCode == "" {
				require.Nil(t, err)
				assert.Equal(t, test.userQuota, info.UserQuota)
				return
			}
			require.NotNil(t, err)
			assert.Equal(t, http.StatusForbidden, err.StatusCode)
			assert.Equal(t, test.wantCode, err.GetErrorCode())
		})
	}
}

func TestACUAdmissionFailureStopsPendingLogAndRouter(t *testing.T) {
	setupACUFinalizeTestDB(t)
	previousPreConsumedQuota := common.PreConsumedQuota
	common.PreConsumedQuota = 500
	t.Cleanup(func() { common.PreConsumedQuota = previousPreConsumedQuota })
	user := model.User{Username: "blocked-user", Password: "test-password", Status: common.UserStatusEnabled, Quota: 499}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "blocked-token", Name: "blocked", Status: common.TokenStatusEnabled, RemainQuota: 500}
	require.NoError(t, model.DB.Create(&token).Error)
	info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: user.Id, TokenId: token.Id}
	pendingCalls, routerCalls := 0, 0

	if admissionErr := CheckACUAdmission(nil, info); admissionErr == nil {
		pendingCalls++
		routerCalls++
	}

	assert.Zero(t, pendingCalls)
	assert.Zero(t, routerCalls)
	var logs int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Count(&logs).Error)
	assert.Zero(t, logs)
}
