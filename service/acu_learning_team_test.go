package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
	"time"
)

func TestLearningTeamNeedsMembershipAndContributionButNoKeyBinding(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	model.DB = db
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{acuPrivatePOCAccessOption: `{"spaces":[{"key":"GYZ","spaceId":"team","memberUserIds":[3,4],"writerUserIds":[3],"enabled":true}]}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})
	for _, token := range []model.Token{{Id: 7, UserId: 3, Key: "a", Status: 1, UnlimitedQuota: true, ExpiredTime: -1}, {Id: 8, UserId: 4, Key: "b", Status: 1, UnlimitedQuota: true, ExpiredTime: -1}, {Id: 9, UserId: 3, Key: "c", Status: 1, UnlimitedQuota: true, ExpiredTime: -1}, {Id: 10, UserId: 3, Key: "expired", Status: 1, UnlimitedQuota: true, ExpiredTime: time.Now().Unix() - 1}, {Id: 11, UserId: 5, Key: "other", Status: 1, UnlimitedQuota: true, ExpiredTime: -1}} {
		require.NoError(t, db.Create(&token).Error)
	}
	team, err := ResolveACULearningTeam(3, 7)
	require.NoError(t, err)
	require.NotNil(t, team)
	assert.Equal(t, "GYZ", team.Team)
	assert.True(t, team.CanWrite)
	otherKey, err := ResolveACULearningTeam(3, 9)
	require.NoError(t, err)
	assert.Equal(t, team, otherKey)
	team, err = ResolveACULearningTeam(4, 8)
	require.NoError(t, err)
	assert.False(t, team.CanWrite)
	team, err = ResolveACULearningTeam(5, 11)
	require.NoError(t, err)
	assert.Nil(t, team)
	_, err = ResolveACULearningTeam(4, 7)
	require.Error(t, err)
	_, err = ResolveACULearningTeam(3, 10)
	require.Error(t, err)
	common.OptionMapRWMutex.Lock()
	common.OptionMap[acuPrivatePOCAccessOption] = `{"spaces":[]}`
	common.OptionMapRWMutex.Unlock()
	team, err = ResolveACULearningTeam(3, 7)
	require.NoError(t, err)
	assert.Nil(t, team)
	require.Error(t, SavePrivateACUPOCAccess(dto.ACUPrivatePOCAccess{Spaces: []dto.ACUPrivatePOCSpaceAccess{{Key: "GYZ", SpaceID: "team", MemberUserIDs: []int{3}, WriterUserIDs: []int{4}}}}))
}
