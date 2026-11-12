package model

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupLogStatTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "logs.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))
	previousDB, previousLogDB := DB, LOG_DB
	previousType, previousGroupCol := common.LogDatabaseType(), logGroupCol
	previousQuota, previousFX := common.QuotaPerUnit, operation_setting.USDExchangeRate
	DB, LOG_DB = db, db
	common.SetLogDatabaseType(common.DatabaseTypeSQLite)
	logGroupCol = "`group`"
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, 6.74
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetLogDatabaseType(previousType)
		logGroupCol = previousGroupCol
		common.QuotaPerUnit, operation_setting.USDExchangeRate = previousQuota, previousFX
		require.NoError(t, sqlDB.Close())
	})
	return db
}

func TestSumUsedQuotaExactCNYAndLegacyFallback(t *testing.T) {
	cases := []struct {
		name  string
		other string
		cny   string
		exact int
	}{
		{"K3 exact string", `{"user_charge_cny":"0.0028740000"}`, "0.002874", 1},
		{"exact number", `{"user_charge_cny":0.0028740000}`, "0.002874", 1},
		{"precise number", `{"user_charge_cny":0.1234567890123456789}`, "0.1234567890123456789", 1},
		{"valid zero", `{"user_charge_cny":"0"}`, "0", 1},
		{"numeric zero", `{"user_charge_cny":0}`, "0", 1},
		{"empty legacy", "", "0.00287124", 0},
		{"missing amount", `{}`, "0.00287124", 0},
		{"malformed JSON", `{"user_charge_cny":`, "0.00287124", 0},
		{"invalid amount", `{"user_charge_cny":"not-money"}`, "0.00287124", 0},
		{"empty amount", `{"user_charge_cny":""}`, "0.00287124", 0},
		{"negative amount", `{"user_charge_cny":"-0.1"}`, "0.00287124", 0},
		{"null amount", `{"user_charge_cny":null}`, "0.00287124", 0},
		{"boolean amount", `{"user_charge_cny":true}`, "0.00287124", 0},
		{"object amount", `{"user_charge_cny":{}}`, "0.00287124", 0},
		{"nonfinite amount", `{"user_charge_cny":"NaN"}`, "0.00287124", 0},
		{"array amount", `{"user_charge_cny":[]}`, "0.00287124", 0},
		{"top-level array", `[{"user_charge_cny":"1"}]`, "0.00287124", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := setupLogStatTestDB(t)
			require.NoError(t, db.Create(&Log{
				Type: LogTypeConsume, CreatedAt: 100, Quota: 213, Other: tc.other,
			}).Error)
			stat, err := SumUsedQuota(LogTypeConsume, 1, 200, "", "", "", 0, "")
			require.NoError(t, err)
			encoded, err := common.Marshal(stat)
			require.NoError(t, err)
			var fields map[string]interface{}
			require.NoError(t, common.Unmarshal(encoded, &fields))
			assert.Equal(t, 213, stat.Quota)
			assert.Equal(t, tc.cny, fields["user_charge_cny"])
			assert.Equal(t, float64(tc.exact), fields["exact_charge_count"])
			assert.Equal(t, float64(1-tc.exact), fields["legacy_charge_count"])
		})
	}
}

func TestSumUsedQuotaDoesNotTransferFullLogMetadata(t *testing.T) {
	db := setupLogStatTestDB(t)
	require.NoError(t, db.Create(&Log{
		Type: LogTypeConsume, Quota: 213,
		Other: `{"user_charge_cny":"0.0028740000","admin_info":{"debug":"` + strings.Repeat("x", 128*1024) + `"}}`,
	}).Error)
	stat, err := SumUsedQuota(LogTypeUnknown, 0, 0, "", "", "", 0, "")
	require.NoError(t, err)
	assert.Equal(t, "0.002874", stat.UserChargeCNY)
	assert.EqualValues(t, 1, stat.ExactChargeCount)
	assert.Zero(t, stat.LegacyChargeCount)
	require.NoError(t, db.Create(&Log{
		Type: LogTypeConsume, Quota: 213,
		Other: `{"admin_info":{"user_charge_cny":"999","debug":"` + strings.Repeat("x", 128*1024) + `"}}`,
	}).Error)
	stat, err = SumUsedQuota(LogTypeUnknown, 0, 0, "", "", "", 0, "")
	require.NoError(t, err)
	assert.Equal(t, "0.00574524", stat.UserChargeCNY)
	assert.EqualValues(t, 1, stat.ExactChargeCount)
	assert.EqualValues(t, 1, stat.LegacyChargeCount)
}

func TestSumUsedQuotaMixedAmountsTypesAndLiveThroughput(t *testing.T) {
	db := setupLogStatTestDB(t)
	now := time.Now().Unix()
	require.NoError(t, db.Create(&[]Log{
		{Type: LogTypeConsume, CreatedAt: 100, Quota: 213, Other: `{"user_charge_cny":"0.0028740000"}`},
		{Type: LogTypeConsume, CreatedAt: 100, Quota: 500000, Other: `{}`},
		{Type: LogTypeConsume, CreatedAt: 100, Quota: 100, Other: `{"user_charge_cny":"0"}`},
		{Type: LogTypeConsume, CreatedAt: now, Quota: 50, PromptTokens: 10, CompletionTokens: 20},
		{Type: LogTypeTopup, CreatedAt: 100, Quota: 900000, Other: `{"user_charge_cny":"999"}`},
		{Type: LogTypeError, CreatedAt: now, Quota: 800000, Other: `{"user_charge_cny":"888"}`, PromptTokens: 1000},
	}).Error)
	for _, logType := range []int{LogTypeUnknown, LogTypeConsume, LogTypeTopup, LogTypeError} {
		stat, err := SumUsedQuota(logType, 1, 200, "", "", "", 0, "")
		require.NoError(t, err)
		encoded, err := common.Marshal(stat)
		require.NoError(t, err)
		var fields map[string]interface{}
		require.NoError(t, common.Unmarshal(encoded, &fields))
		if logType == LogTypeUnknown || logType == LogTypeConsume {
			assert.Equal(t, 500313, stat.Quota)
			assert.Equal(t, 1, stat.Rpm, "RPM remains live, independent of historical date range")
			assert.Equal(t, 30, stat.Tpm)
			assert.Equal(t, "6.742874", fields["user_charge_cny"])
			assert.Equal(t, float64(2), fields["exact_charge_count"])
			assert.Equal(t, float64(1), fields["legacy_charge_count"])
		} else {
			assert.Zero(t, stat.Quota)
			assert.Zero(t, stat.Rpm)
			assert.Zero(t, stat.Tpm)
			assert.Equal(t, "0", fields["user_charge_cny"])
			assert.Equal(t, float64(0), fields["exact_charge_count"])
			assert.Equal(t, float64(0), fields["legacy_charge_count"])
		}
	}
}

func TestSumUsedQuotaEmptyAndCurrentLegacyFX(t *testing.T) {
	db := setupLogStatTestDB(t)
	stat, err := SumUsedQuota(LogTypeUnknown, 0, 0, "", "", "", 0, "")
	require.NoError(t, err)
	encoded, err := common.Marshal(stat)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"user_charge_cny":"0"`)
	require.NoError(t, db.Create(&Log{Type: LogTypeConsume, Quota: 500000}).Error)
	operation_setting.USDExchangeRate = 7
	stat, err = SumUsedQuota(LogTypeUnknown, 0, 0, "", "", "", 0, "")
	require.NoError(t, err)
	encoded, err = common.Marshal(stat)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"user_charge_cny":"7"`)
}
