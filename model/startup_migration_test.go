package model

import (
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitDBWithoutMigrationDoesNotCreateSchema(t *testing.T) {
	previousDB := DB
	previousMaster := common.IsMasterNode
	previousPath := common.SQLitePath
	previousDatabaseType := common.MainDatabaseType()
	t.Cleanup(func() {
		DB = previousDB
		common.IsMasterNode = previousMaster
		common.SQLitePath = previousPath
		common.SetMainDatabaseType(previousDatabaseType)
	})
	t.Setenv("SQL_DSN", "")
	t.Setenv("SKIP_AUTO_MIGRATE", "true")
	common.IsMasterNode = true
	common.SQLitePath = filepath.Join(t.TempDir(), "unmigrated.db")

	require.NoError(t, InitDB())
	sqlDB, err := DB.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	assert.False(t, DB.Migrator().HasTable(&User{}))
	assert.False(t, DB.Migrator().HasTable(&CasbinRule{}))
}
