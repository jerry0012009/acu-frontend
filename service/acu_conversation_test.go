package service

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestConversationAcceptsUsableKeysRegardlessOfNativeProtocol(t *testing.T) {
	for _, protocol := range []string{"messages", "chat_completions", "gemini", "responses"} {
		t.Run(protocol, func(t *testing.T) {
			assert.True(t, IsACUConversationTokenEligible(&model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true, ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"provider:model:" + protocol}}, 1000))
		})
	}
}

func TestConversationDoesNotRequireGenericPreconsumeQuotaForCheapRequests(t *testing.T) {
	assert.True(t, IsACUConversationTokenEligible(&model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 1}, 1000))
	assert.False(t, IsACUConversationTokenEligible(&model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 0}, 1000))
}
