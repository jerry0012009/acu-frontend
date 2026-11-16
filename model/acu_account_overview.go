package model

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"github.com/tidwall/gjson"
)

type ACUAccountModelUsage struct {
	Model     string `json:"model"`
	Count     int64  `json:"count"`
	ChargeCNY string `json:"chargeCny"`
}

type ACUAccountComparison struct {
	ReferenceCNY string  `json:"referenceCny"`
	ChargeCNY    string  `json:"chargeCny"`
	SavedCNY     string  `json:"savedCny"`
	SavedPercent *string `json:"savedPercent"`
	Count        int64   `json:"count"`
	Basis        string  `json:"basis"`
}

type ACUAccountOverview struct {
	ChargeCNY         string                 `json:"chargeCny"`
	Count             int64                  `json:"count"`
	Models            []ACUAccountModelUsage `json:"models"`
	Comparison        ACUAccountComparison   `json:"comparison"`
	ExactChargeCount  int64                  `json:"exactChargeCount"`
	LegacyChargeCount int64                  `json:"legacyChargeCount"`
}

// Stream rows and retain only billing facts; do not deserialize large diagnostics.
func accountOverviewMetadata(metadata string) map[string]json.RawMessage {
	fields := []string{"user_charge_cny", "acu_cost_breakdown.canonical_model", "acu_cost_breakdown.retail_reference_amount_cny", "acu_cost_breakdown.retail_reference_type", "acu_cost_breakdown.retail_reference_source", "acu_billing_status"}
	result := make(map[string]json.RawMessage, len(fields))
	if !gjson.Valid(metadata) || !gjson.Parse(metadata).IsObject() {
		return result
	}
	for i, value := range gjson.GetMany(metadata, fields...) {
		if value.Exists() {
			result[fields[i]] = json.RawMessage(value.Raw)
		}
	}
	return result
}

func accountOverviewAmount(raw json.RawMessage) (decimal.Decimal, bool) {
	if common.GetJsonType(raw) == "string" {
		var text string
		if common.Unmarshal(raw, &text) != nil {
			return decimal.Zero, false
		}
		raw = []byte(text)
	} else if common.GetJsonType(raw) != "number" {
		return decimal.Zero, false
	}
	amount, err := decimal.NewFromString(string(raw))
	return amount, err == nil && !amount.IsNegative()
}

// Read-only aggregation of all consumption in a bounded account/date scope.
func GetACUAccountOverview(ctx context.Context, userID int, start, end int64) (ACUAccountOverview, error) {
	result := ACUAccountOverview{ChargeCNY: "0", Models: []ACUAccountModelUsage{}, Comparison: ACUAccountComparison{ReferenceCNY: "0", ChargeCNY: "0", SavedCNY: "0", Basis: "unavailable"}}
	if userID <= 0 || start <= 0 || end < start || end-start > 31*86400 {
		return result, fmt.Errorf("invalid account overview range")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	rows, err := LOG_DB.WithContext(ctx).Table("logs").Select("model_name, quota, other").Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?", userID, LogTypeConsume, start, end).Rows()
	if err != nil {
		return result, err
	}
	defer rows.Close()
	total, reference, compared := decimal.Zero, decimal.Zero, decimal.Zero
	type bucket struct {
		count  int64
		charge decimal.Decimal
	}
	models := map[string]bucket{}
	type referenceBucket struct {
		reference, charge decimal.Decimal
		count             int64
	}
	buckets := map[string]referenceBucket{}
	for rows.Next() {
		var name, metadata string
		var quota int64
		if err = rows.Scan(&name, &quota, &metadata); err != nil {
			return result, err
		}
		fields := accountOverviewMetadata(metadata)
		var status string
		_ = common.Unmarshal(fields["acu_billing_status"], &status)
		if status == "unsettled" || status == "pending" {
			continue
		}
		charge, exact := accountOverviewAmount(fields["user_charge_cny"])
		if exact {
			result.ExactChargeCount++
		} else {
			result.LegacyChargeCount++
		}
		if !exact {
			if common.QuotaPerUnit <= 0 || operation_setting.USDExchangeRate <= 0 {
				return result, fmt.Errorf("invalid quota conversion")
			}
			charge = decimal.NewFromInt(quota).Mul(decimal.NewFromFloat(operation_setting.USDExchangeRate)).Div(decimal.NewFromFloat(common.QuotaPerUnit))
			if charge.IsNegative() {
				return result, fmt.Errorf("invalid historical charge")
			}
		}
		var canonical, basis, referenceSource string
		_ = common.Unmarshal(fields["acu_cost_breakdown.canonical_model"], &canonical)
		_ = common.Unmarshal(fields["acu_cost_breakdown.retail_reference_type"], &basis)
		_ = common.Unmarshal(fields["acu_cost_breakdown.retail_reference_source"], &referenceSource)
		if canonical != "" {
			name = canonical
		}
		if name == "" {
			name = "unknown"
		}
		item := models[name]
		item.count++
		item.charge = item.charge.Add(charge)
		models[name] = item
		total = total.Add(charge)
		result.Count++
		ref, known := accountOverviewAmount(fields["acu_cost_breakdown.retail_reference_amount_cny"])
		if exact && known && ref.IsPositive() && status == "finalized" && (basis == "official" || basis == "platform" || basis == "openrouter") {
			key := basis
			if basis != "official" {
				key += ":" + referenceSource
			}
			bucket := buckets[key]
			bucket.reference = bucket.reference.Add(ref)
			bucket.charge = bucket.charge.Add(charge)
			bucket.count++
			buckets[key] = bucket
		}
	}
	if err = rows.Err(); err != nil {
		return result, err
	}
	result.ChargeCNY = total.String()
	for name, item := range models {
		result.Models = append(result.Models, ACUAccountModelUsage{Model: name, Count: item.count, ChargeCNY: item.charge.String()})
	}
	sort.Slice(result.Models, func(i, j int) bool {
		a, _ := decimal.NewFromString(result.Models[i].ChargeCNY)
		b, _ := decimal.NewFromString(result.Models[j].ChargeCNY)
		if a.Equal(b) {
			return result.Models[i].Model < result.Models[j].Model
		}
		return a.GreaterThan(b)
	})
	selectedBasis := ""
	if buckets["official"].count > 0 {
		selectedBasis = "official"
	} else {
		// Compare a single explicit benchmark cohort; a new minority source must
		// not erase an otherwise usable comparison. Never add unrelated bases.
		for key, bucket := range buckets {
			if selectedBasis == "" || bucket.count > buckets[selectedBasis].count || (bucket.count == buckets[selectedBasis].count && key < selectedBasis) {
				selectedBasis = key
			}
		}
	}
	if selectedBasis != "" {
		bucket := buckets[selectedBasis]
		reference, compared = bucket.reference, bucket.charge
		result.Comparison.Count = bucket.count
		if selectedBasis == "official" {
			result.Comparison.Basis = "official"
		} else {
			result.Comparison.Basis = strings.SplitN(selectedBasis, ":", 2)[0]
		}
	}
	result.Comparison.ReferenceCNY = reference.String()
	result.Comparison.ChargeCNY = compared.String()
	result.Comparison.SavedCNY = reference.Sub(compared).String()
	if reference.IsPositive() {
		percent := reference.Sub(compared).Div(reference).Mul(decimal.NewFromInt(100)).StringFixed(2)
		result.Comparison.SavedPercent = &percent
	}
	return result, nil
}
