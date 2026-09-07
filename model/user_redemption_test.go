package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserRedemptionTest(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&User{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Log{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&User{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Log{}).Error)
	})
}

func TestUserInsertAutomaticallyRedeemsCode(t *testing.T) {
	setupUserRedemptionTest(t)

	oldQuotaForNewUser := common.QuotaForNewUser
	common.QuotaForNewUser = 100
	t.Cleanup(func() { common.QuotaForNewUser = oldQuotaForNewUser })

	const key = "20000000000000000000000000000001"
	require.NoError(t, DB.Create(&Redemption{
		Name:        "signup-campaign",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       500000,
		CreatedTime: common.GetTimestamp(),
	}).Error)

	user := &User{
		Username:   "signup-redeem-user",
		Password:   "password123",
		RedeemCode: key,
		Status:     common.UserStatusEnabled,
		Role:       common.RoleCommonUser,
	}
	require.NoError(t, user.Insert(0))

	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	assert.Equal(t, common.QuotaForNewUser+500000, stored.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "key = ?", key).Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, user.Id, redemption.UsedUserId)
}

func TestUserInsertRollsBackWhenRedeemCodeIsInvalid(t *testing.T) {
	setupUserRedemptionTest(t)

	user := &User{
		Username:   "signup-invalid-redeem-user",
		Password:   "password123",
		RedeemCode: "missing-code",
		Status:     common.UserStatusEnabled,
		Role:       common.RoleCommonUser,
	}
	err := user.Insert(0)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrRedeemCodeInvalid))

	var count int64
	require.NoError(t, DB.Model(&User{}).Where("username = ?", user.Username).Count(&count).Error)
	assert.Zero(t, count)
}
