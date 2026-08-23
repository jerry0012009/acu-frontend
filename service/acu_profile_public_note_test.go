package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestACUProfilePublicNoteIsEditableAndVisibleInMonitor(t *testing.T) {
	clearACUChannelMonitorCache()
	previousDB := model.DB
	previousOptions := common.OptionMap
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	model.DB = db
	common.OptionMap = map[string]string{}
	t.Cleanup(func() {
		clearACUChannelMonitorCache()
		model.DB = previousDB
		common.OptionMap = previousOptions
	})

	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"profiles":[{
				"executionProfileId":"provider:model:messages",
				"canonicalModel":"model","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":true
			}],
			"history":[],"cooldownIntervals":[],"probeHistory":[],
			"supplyInventory":[],"modelPool":[]
		}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	updated, err := UpdateACUProfilePublicNote(
		context.Background(),
		dto.ACUProfilePublicNoteUpdate{
			ExecutionProfileID: "provider:model:messages",
			Note:               "Stable Messages route",
		},
	)
	require.NoError(t, err)
	require.Equal(t, "Stable Messages route", updated.Note)

	monitor, err := GetACUChannelMonitor(
		context.Background(),
		"24h",
		"balanced",
		"standard",
		"48h",
		"messages",
	)
	require.NoError(t, err)
	require.Equal(t, "Stable Messages route", monitor.Profiles[0].PublicNote)

	_, err = UpdateACUProfilePublicNote(
		context.Background(),
		dto.ACUProfilePublicNoteUpdate{
			ExecutionProfileID: "provider:model:messages",
			Note:               "",
		},
	)
	require.NoError(t, err)
	monitor, err = GetACUChannelMonitor(
		context.Background(),
		"24h",
		"balanced",
		"standard",
		"48h",
		"messages",
	)
	require.NoError(t, err)
	require.Empty(t, monitor.Profiles[0].PublicNote)

	_, err = UpdateACUProfilePublicNote(
		context.Background(),
		dto.ACUProfilePublicNoteUpdate{
			ExecutionProfileID: "provider:model:messages",
			Note:               strings.Repeat("x", 501),
		},
	)
	require.ErrorContains(t, err, "500 characters")

	_, err = UpdateACUProfilePublicNote(
		context.Background(),
		dto.ACUProfilePublicNoteUpdate{
			ExecutionProfileID: "missing:model:messages",
			Note:               "not stored",
		},
	)
	require.ErrorContains(t, err, "not found")
}
