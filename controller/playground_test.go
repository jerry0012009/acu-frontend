package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

func TestSelectPlaygroundACUTokenUsesEnabledBillableToken(t *testing.T) {
	now := int64(1000)
	tokens := []*model.Token{
		{Id: 5, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true, ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"provider:claude-opus:messages"}},
		{Id: 4, Status: common.TokenStatusEnabled, ExpiredTime: now - 1, UnlimitedQuota: true},
		{Id: 3, Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: common.PreConsumedQuota - 1},
		{Id: 2, Status: common.TokenStatusDisabled, ExpiredTime: -1, UnlimitedQuota: true},
		{Id: 1, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true, ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"provider:glm-5.2:responses"}},
	}

	token, err := service.SelectACUConversationToken(tokens, now)
	require.NoError(t, err)
	require.Equal(t, 1, token.Id)
}

func TestSelectPlaygroundACUTokenRejectsMissingUsableToken(t *testing.T) {
	_, err := service.SelectACUConversationToken(nil, 1000)
	require.ErrorContains(t, err, "enabled API key")
}
