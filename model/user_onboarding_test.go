package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestNewUserReceivesDefaultKeyInRegistrationTransaction(t *testing.T) {
	for _, externalTransaction := range []bool{false, true} {
		t.Run(map[bool]string{false: "password", true: "oauth"}[externalTransaction], func(t *testing.T) {
			setupUserUpdateTestState(t)
			previous := constant.GenerateDefaultToken
			constant.GenerateDefaultToken = true
			t.Cleanup(func() { constant.GenerateDefaultToken = previous })
			user := &User{Username: "new-onboarding", Role: common.RoleCommonUser, Password: "password123"}
			if externalTransaction {
				require.NoError(t, DB.Transaction(func(tx *gorm.DB) error { return user.InsertWithTx(tx, 0) }))
			} else {
				require.NoError(t, user.Insert(0))
			}
			var tokens []Token
			require.NoError(t, DB.Where("user_id = ?", user.Id).Find(&tokens).Error)
			require.Len(t, tokens, 1)
			assert.Equal(t, "Default API Key", tokens[0].Name)
			assert.NotEmpty(t, tokens[0].Key)
			assert.True(t, tokens[0].UnlimitedQuota)
			assert.Zero(t, tokens[0].RemainQuota)
			assert.False(t, tokens[0].ModelLimitsEnabled)
			var stored User
			require.NoError(t, DB.First(&stored, user.Id).Error)
			assert.Equal(t, common.QuotaForNewUser, stored.Quota)
			assert.Contains(t, stored.Setting, `"acu_onboarding_pending":true`)
		})
	}
}

func TestRegistrationRollbackDoesNotLeaveDefaultKey(t *testing.T) {
	setupUserUpdateTestState(t)
	previous := constant.GenerateDefaultToken
	constant.GenerateDefaultToken = true
	t.Cleanup(func() { constant.GenerateDefaultToken = previous })
	user := &User{Username: "rollback-onboarding", Role: common.RoleCommonUser}
	failure := errors.New("binding failed")
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		return failure
	})
	require.ErrorIs(t, err, failure)
	var count int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", user.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func TestRegistrationHonorsExplicitDefaultKeyOptOut(t *testing.T) {
	setupUserUpdateTestState(t)
	previous := constant.GenerateDefaultToken
	constant.GenerateDefaultToken = false
	t.Cleanup(func() { constant.GenerateDefaultToken = previous })
	user := &User{Username: "key-opt-out", Role: common.RoleCommonUser}
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error { return user.InsertWithTx(tx, 0) }))
	var count int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", user.Id).Count(&count).Error)
	assert.Zero(t, count)
	assert.True(t, user.GetSetting().ACUOnboardingPending)
}

func TestDefaultKeyFailureRollsBackNewAccount(t *testing.T) {
	setupUserUpdateTestState(t)
	previous := constant.GenerateDefaultToken
	constant.GenerateDefaultToken = true
	t.Cleanup(func() { constant.GenerateDefaultToken = previous })
	failure := errors.New("key storage unavailable")
	callback := "test:registration-key-failure"
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if tx.Statement.Table == "tokens" {
			tx.AddError(failure)
		}
	}))
	t.Cleanup(func() { DB.Callback().Create().Remove(callback) })
	user := &User{Username: "key-failure", Role: common.RoleCommonUser}
	err := DB.Transaction(func(tx *gorm.DB) error { return user.InsertWithTx(tx, 0) })
	require.ErrorIs(t, err, failure)
	var count int64
	require.NoError(t, DB.Model(&User{}).Where("username = ?", user.Username).Count(&count).Error)
	assert.Zero(t, count)
}
