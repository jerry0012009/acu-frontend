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

func TestLearningProjectSeparatesMembershipContributionAndKeyBinding(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	model.DB = db
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{acuPrivatePOCAccessOption: `{"spaces":[{"key":"GYZ","spaceId":"team","memberUserIds":[3,4],"writerUserIds":[3],"enabled":true,"projects":[{"id":"ad-a","name":"广告A","tokenIds":[7,8],"enabled":true}]}]}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})
	for _, token := range []model.Token{{Id: 7, UserId: 3, Key: "a", Status: 1, ExpiredTime: -1}, {Id: 8, UserId: 4, Key: "b", Status: 1, ExpiredTime: -1}, {Id: 9, UserId: 3, Key: "c", Status: 1, ExpiredTime: -1}, {Id: 10, UserId: 3, Key: "expired", Status: 1, ExpiredTime: time.Now().Unix() - 1}} {
		token.UnlimitedQuota = true
		require.NoError(t, db.Create(&token).Error)
	}
	project, err := ResolveACULearningProject(3, 7, "")
	require.NoError(t, err)
	require.NotNil(t, project)
	assert.Equal(t, "ad-a", project.ID)
	assert.True(t, project.CanWrite)
	project, err = ResolveACULearningProject(4, 8, "")
	require.NoError(t, err)
	assert.False(t, project.CanWrite)
	project, err = ResolveACULearningProject(3, 9, "")
	require.NoError(t, err)
	assert.Nil(t, project)
	_, err = ResolveACULearningProject(4, 7, "")
	require.Error(t, err)
	_, err = ResolveACULearningProject(3, 7, "ad-b")
	require.Error(t, err)
	_, err = ResolveACULearningProject(3, 9, "ad-a")
	require.Error(t, err)
	_, err = ResolveACULearningProject(3, 10, "")
	require.Error(t, err)
	common.OptionMapRWMutex.Lock()
	common.OptionMap[acuPrivatePOCAccessOption] = `{"spaces":[{"key":"GYZ","spaceId":"team","memberUserIds":[],"writerUserIds":[],"enabled":true,"projects":[{"id":"ad-a","name":"广告A","tokenIds":[7],"enabled":true}]}]}`
	common.OptionMapRWMutex.Unlock()
	project, err = ResolveACULearningProject(3, 7, "")
	require.NoError(t, err)
	assert.False(t, project.CanWrite)
	invalid := dto.ACUPrivatePOCAccess{Spaces: []dto.ACUPrivatePOCSpaceAccess{{Key: "GYZ", SpaceID: "team", MemberUserIDs: []int{3}, WriterUserIDs: []int{4}}}}
	require.Error(t, SavePrivateACUPOCAccess(invalid))
	invalid.Spaces[0].WriterUserIDs = []int{3}
	invalid.Spaces[0].Projects = []dto.ACULearningProject{{ID: "a", Name: "A", TokenIDs: []int{7}}, {ID: "b", Name: "B", TokenIDs: []int{7}}}
	require.Error(t, SavePrivateACUPOCAccess(invalid))
	invalid.Spaces[0].Projects = []dto.ACULearningProject{{ID: "a", Name: "A", TokenIDs: []int{8}}}
	require.Error(t, SavePrivateACUPOCAccess(invalid))
}
