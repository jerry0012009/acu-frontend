package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestResolveACUEffectiveRoutingPolicyUsesTokenAndGlobalIntersection(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{"ACUGlobalRoutingPolicy": `{"modelPolicy":"custom_allowlist","allowedModelIds":["a","b"],"profilePolicy":"custom_allowlist","allowedProfileIds":["p1","p2"]}`}
	policy, err := ResolveACUEffectiveRoutingPolicy(&model.Token{ModelLimitsEnabled: true, ModelLimits: "b,c", ACUProfileLimitsEnabled: true, ACUProfileLimits: []string{"p2", "p3"}, ACURoutingPreference: "economy"})
	require.NoError(t, err)
	require.Equal(t, ACURoutingPolicyCustom, policy.RoutingPolicy)
	require.Equal(t, []string{"b"}, policy.AllowedModelIDs)
	require.Equal(t, []string{"p2"}, policy.AllowedProfileIDs)
	require.Equal(t, "economy", policy.RoutingPreference)
}

func TestResolveACUEffectiveRoutingPolicyRejectsEmptyIntersection(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{"ACUGlobalRoutingPolicy": `{"modelPolicy":"custom_allowlist","allowedModelIds":["a"]}`}
	_, err := ResolveACUEffectiveRoutingPolicy(&model.Token{ModelLimitsEnabled: true, ModelLimits: "b"})
	require.ErrorContains(t, err, "intersection is empty")
}

func TestNormalizeACURoutingPreferenceDefaultsAndRejectsInvalid(t *testing.T) {
	value, err := NormalizeACURoutingPreference("")
	require.NoError(t, err)
	require.Equal(t, "balanced", value)
	_, err = NormalizeACURoutingPreference("xhigh")
	require.Error(t, err)
}
