package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCreativeWorkRecordScopeAndReceipt(t *testing.T) {
	var item creativeHistoryItem
	require.NoError(t, common.UnmarshalJsonStr(`{"requestId":"image-one","fingerprint":"hash","supplement":"突出工作区。保留暗部细节。","references":[{"scope":"team","quote":"private team rule"}]}`, &item))
	prepared := projectCreativeWorkRecord(item, true, "")
	assert.Equal(t, "guidance_prepared", prepared.State)
	assert.Equal(t, "突出工作区。", prepared.Summary)
	assert.Equal(t, "GYZ 团队经验", prepared.Basis)
	applied := projectCreativeWorkRecord(item, true, "hash")
	assert.Equal(t, "guidance_applied", applied.State)
	assert.Equal(t, "guidance_prepared", projectCreativeWorkRecord(item, true, "other").State)
	revoked := projectCreativeWorkRecord(item, false, "hash")
	assert.Empty(t, revoked.Detail)
	assert.Empty(t, revoked.Sources)
	item.References[0].Scope = "unknown"
	assert.Empty(t, projectCreativeWorkRecord(item, true, "hash").Detail)
}
