package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Opt-in replay of real log evidence for the full-page browser acceptance.
// Artifacts stay outside the repository and never include request bodies.
func TestTimelineQualityVisualReplay(t *testing.T) {
	dir := os.Getenv("ACU_VISUAL_DATA_DIR")
	if dir == "" {
		t.Skip("ACU_VISUAL_DATA_DIR is not set")
	}
	raw, err := os.ReadFile(filepath.Join(dir, "logs.json"))
	require.NoError(t, err)
	var logs []*model.Log
	require.NoError(t, common.Unmarshal(raw, &logs))
	require.NotEmpty(t, logs)
	raw, err = os.ReadFile(filepath.Join(dir, "monitor.json"))
	require.NoError(t, err)
	var monitor dto.ACUChannelMonitor
	require.NoError(t, common.Unmarshal(raw, &monitor))
	catalog := dto.ACURoutingCatalog{CatalogVersion: monitor.CatalogVersion}
	for _, value := range monitor.ModelPool {
		catalog.Models = append(catalog.Models, dto.ACURoutingCatalogModel{
			ModelID: stringValue(value, "modelId"), DisplayName: stringValue(value, "displayName"),
			Protocols: stringSlice(value["protocols"]),
			Curve:     routingCatalogCurve(value["curve"]), ReferencePricing: routingCatalogReference(value["referencePricing"]),
		})
	}
	result := buildACUWorkTimelineWithQuality(logs, logs[0].CreatedAt, logs[len(logs)-1].CreatedAt, true, &catalog)
	recorded := 0
	for _, item := range result.Items {
		if item.PointType == "judge" {
			assert.Nil(t, item.QualityComparison)
			continue
		}
		comparison := item.QualityComparison
		require.NotNil(t, comparison)
		if comparison.EstimatedQuality != nil {
			recorded++
			assert.True(t, validTimelineQualityNumber(*comparison.EstimatedQuality, 100))
		}
		if comparison.SameBudget != nil {
			require.NotNil(t, comparison.ModelChargeCNY)
			assert.Positive(t, comparison.SameBudget.OfficialCostCNY)
		}
	}
	require.Positive(t, recorded, "real logs must produce recorded quality points")
	raw, err = common.Marshal(map[string]interface{}{"success": true, "data": result})
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "timeline.json"), raw, 0600))
	t.Logf("Replayed %d execution steps, %d recorded quality points", result.Summary.ExecutionSteps, recorded)
}
