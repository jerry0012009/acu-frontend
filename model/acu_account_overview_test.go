package model

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAccountOverviewUsesAllScopedConsumptionAndMatchedReference(t *testing.T) {
	db := setupLogStatTestDB(t)
	require.NoError(t, db.Create(&[]Log{
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 100, ModelName: "acu-auto", Other: `{"user_charge_cny":"2","acu_billing_status":"finalized","acu_cost_breakdown":{"canonical_model":"sol","retail_reference_amount_cny":"10","retail_reference_type":"official"}}`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 101, ModelName: "sol", Other: `{"user_charge_cny":"1","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"5","retail_reference_type":"platform"}}`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 102, ModelName: "legacy", Quota: 500000, Other: `broken`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 103, ModelName: "zero", Other: `{"user_charge_cny":"0","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"2","retail_reference_type":"official"}}`},
		{UserId: 123, Type: LogTypeConsume, CreatedAt: 100, ModelName: "other", Other: `{"user_charge_cny":"999"}`},
		{UserId: 122, Type: LogTypeTopup, CreatedAt: 100, Quota: 999999},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 300, Other: `{"user_charge_cny":"999"}`},
	}).Error)
	result, err := GetACUAccountOverview(context.Background(), 122, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, "9.74", result.ChargeCNY)
	assert.EqualValues(t, 4, result.Count)
	require.Len(t, result.Models, 3)
	assert.Equal(t, "legacy", result.Models[0].Model)
	assert.Equal(t, "sol", result.Models[1].Model)
	assert.EqualValues(t, 2, result.Models[1].Count)
	assert.Equal(t, "3", result.Models[1].ChargeCNY)
	assert.Equal(t, "12", result.Comparison.ReferenceCNY)
	assert.Equal(t, "2", result.Comparison.ChargeCNY)
	assert.Equal(t, "10", result.Comparison.SavedCNY)
	require.NotNil(t, result.Comparison.SavedPercent)
	assert.Equal(t, "83.33", *result.Comparison.SavedPercent)
	assert.Equal(t, "official", result.Comparison.Basis)
	assert.EqualValues(t, 2, result.Comparison.Count, "include valid zero charges, but never mix a third-party reference into an official comparison")
}

func TestAccountOverviewMetadataIgnoresDiagnosticsAndInvalidEnvelopes(t *testing.T) {
	for _, invalid := range []string{`broken`, `{"user_charge_cny":"999"`, `[{"user_charge_cny":"999"}]`, `null`} {
		assert.Empty(t, accountOverviewMetadata(invalid))
	}
	metadata := `{"admin_info":{"user_charge_cny":"999","debug":"` + strings.Repeat("x", 512*1024) + `"},"user_charge_cny":0.1234567890123456789,"acu_billing_status":"finalized","acu_cost_breakdown":{"canonical_model":"sol","retail_reference_amount_cny":"2"}}`
	fields := accountOverviewMetadata(metadata)
	assert.Equal(t, "0.1234567890123456789", string(fields["user_charge_cny"]))
	assert.Equal(t, `"sol"`, string(fields["acu_cost_breakdown.canonical_model"]))
	assert.Len(t, fields, 4)
}

func TestAccountOverviewDoesNotInventSavingsOrClampPremium(t *testing.T) {
	for _, tc := range []struct {
		name, other, basis, saved string
		percent                   *string
	}{
		{name: "missing", other: `{"user_charge_cny":"2"}`, basis: "unavailable", saved: "0"},
		{name: "unsettled", other: `{"user_charge_cny":"2","acu_billing_status":"unsettled","acu_cost_breakdown":{"retail_reference_amount_cny":"10","retail_reference_type":"official"}}`, basis: "unavailable", saved: "0"},
		{name: "negative-reference", other: `{"user_charge_cny":"2","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"-10","retail_reference_type":"official"}}`, basis: "unavailable", saved: "0"},
		{name: "premium", other: `{"user_charge_cny":"3","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"2","retail_reference_type":"official"}}`, basis: "official", saved: "-1", percent: func() *string { s := "-50.00"; return &s }()},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := setupLogStatTestDB(t)
			require.NoError(t, db.Create(&Log{UserId: 122, Type: LogTypeConsume, CreatedAt: 100, ModelName: "model", Other: tc.other}).Error)
			result, err := GetACUAccountOverview(context.Background(), 122, 1, 200)
			require.NoError(t, err)
			assert.Equal(t, tc.basis, result.Comparison.Basis)
			assert.Equal(t, tc.saved, result.Comparison.SavedCNY)
			assert.Equal(t, tc.percent, result.Comparison.SavedPercent)
			if tc.name == "unsettled" {
				assert.Zero(t, result.Count)
				assert.Equal(t, "0", result.ChargeCNY)
			}
		})
	}
}

func TestAccountOverviewRejectsUnboundedOrUnauthenticatedScope(t *testing.T) {
	for _, args := range [][3]int64{{0, 1, 200}, {122, 0, 200}, {122, 200, 100}, {122, 1, 32 * 86400}} {
		_, err := GetACUAccountOverview(context.Background(), int(args[0]), args[1], args[2])
		require.Error(t, err)
	}
}

func TestAccountOverviewPreservesNumericMoneyPrecision(t *testing.T) {
	db := setupLogStatTestDB(t)
	require.NoError(t, db.Create(&Log{UserId: 122, Type: LogTypeConsume, CreatedAt: 100, ModelName: "sol", Other: `{"user_charge_cny":0.1234567890123456789,"acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":0.2234567890123456789,"retail_reference_type":"official"}}`}).Error)
	result, err := GetACUAccountOverview(context.Background(), 122, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, "0.1234567890123456789", result.ChargeCNY)
	assert.Equal(t, "0.2234567890123456789", result.Comparison.ReferenceCNY)
	assert.Equal(t, "0.1", result.Comparison.SavedCNY)
}

func TestAccountOverviewPrefersOfficialBenchmarkInsteadOfMixingReferences(t *testing.T) {
	db := setupLogStatTestDB(t)
	require.NoError(t, db.Create(&[]Log{
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 100, ModelName: "official", Other: `{"user_charge_cny":"2","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"10","retail_reference_type":"official"}}`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 101, ModelName: "platform", Other: `{"user_charge_cny":"1","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"50","retail_reference_type":"platform","retail_reference_source":"community"}}`},
	}).Error)
	result, err := GetACUAccountOverview(context.Background(), 122, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, "official", result.Comparison.Basis)
	assert.Equal(t, "10", result.Comparison.ReferenceCNY)
	assert.Equal(t, "2", result.Comparison.ChargeCNY)
	assert.EqualValues(t, 1, result.Comparison.Count)
}

func TestAccountOverviewKeepsOneCohortWhenAnotherBenchmarkAppears(t *testing.T) {
	db := setupLogStatTestDB(t)
	require.NoError(t, db.Create(&[]Log{
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 100, ModelName: "a", Other: `{"user_charge_cny":"2","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"10","retail_reference_type":"platform","retail_reference_source":"a"}}`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 101, ModelName: "b", Other: `{"user_charge_cny":"1","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"50","retail_reference_type":"openrouter","retail_reference_source":"b"}}`},
		{UserId: 122, Type: LogTypeConsume, CreatedAt: 102, ModelName: "a", Other: `{"user_charge_cny":"3","acu_billing_status":"finalized","acu_cost_breakdown":{"retail_reference_amount_cny":"10","retail_reference_type":"platform","retail_reference_source":"a"}}`},
	}).Error)
	result, err := GetACUAccountOverview(context.Background(), 122, 1, 200)
	require.NoError(t, err)
	assert.Equal(t, "platform", result.Comparison.Basis)
	require.NotNil(t, result.Comparison.SavedPercent)
	assert.Equal(t, "75.00", *result.Comparison.SavedPercent)
	assert.Equal(t, "20", result.Comparison.ReferenceCNY)
	assert.Equal(t, "5", result.Comparison.ChargeCNY)
	assert.EqualValues(t, 2, result.Comparison.Count)
}
