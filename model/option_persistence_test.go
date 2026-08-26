package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionsBulkDoesNotPublishFailedDatabaseWrite(t *testing.T) {
	db := useFrontendOptionMigrationDB(t)
	previousMap := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousMap })
	common.OptionMap = map[string]string{"test-option": "old"}
	require.NoError(t, db.Create(&Option{Key: "test-option", Value: "old"}).Error)

	forcedErr := errors.New("forced option write failure")
	callbackName := "test:fail_option_write"
	require.NoError(t, db.Callback().Update().Before("gorm:update").Register(
		callbackName,
		func(tx *gorm.DB) {
			if tx.Statement != nil && tx.Statement.Table == "options" {
				tx.AddError(forcedErr)
			}
		},
	))
	t.Cleanup(func() {
		_ = db.Callback().Update().Remove(callbackName)
	})

	err := UpdateOptionsBulk(map[string]string{"test-option": "new"})
	assert.ErrorIs(t, err, forcedErr)
	assert.Equal(t, "old", common.OptionMap["test-option"])
	assert.Equal(t, "old", requireOptionValue(t, db, "test-option"))
}
