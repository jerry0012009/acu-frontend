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

func TestCreativeWorkPresentationIsScopedAndDoesNotInventApplication(t *testing.T) {
	var item creativeHistoryItem
	require.NoError(t, common.UnmarshalJsonStr(`{"requestId":"image","fingerprint":"hash","supplement":"English raw prompt","references":[{"scope":"team","quote":"团队原文"}],"presentation":{"title":"突出桌前工作区","summary":"台灯照亮笔记，降低窗外亮度。","basis":"按光源角色分配亮度。"}}`, &item))
	record := projectCreativeWorkRecord(item, true, "")
	assert.Equal(t, "突出桌前工作区", record.Title)
	assert.Equal(t, "台灯照亮笔记，降低窗外亮度。", record.Summary)
	assert.Equal(t, "按光源角色分配亮度。", record.Rationale)
	assert.Equal(t, "guidance_prepared", record.State)
	assert.Equal(t, "English raw prompt", record.Detail)
	assert.Empty(t, projectCreativeWorkRecord(item, false, "").Rationale)
	item.Presentation.Title = "English only"
	assert.Equal(t, "图片视觉建议", projectCreativeWorkRecord(item, true, "").Title)
}
