package service

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
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
	require.Equal(t, []string{"a", "b"}, policy.AllowedModelIDs)
	require.Equal(t, []string{"p2"}, policy.AllowedProfileIDs)
	require.Equal(t, "economy", policy.RoutingPreference)
}

func TestResolveACUEffectiveRoutingPolicyDefaultTokenDynamicallyInheritsGlobalProfiles(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	token := &model.Token{}
	common.OptionMap = map[string]string{"ACUGlobalRoutingPolicy": `{"profilePolicy":"custom_allowlist","allowedProfileIds":["p1"]}`}

	initial, err := ResolveACUEffectiveRoutingPolicy(token)
	require.NoError(t, err)
	require.Equal(t, []string{"p1"}, initial.AllowedProfileIDs)

	common.OptionMap["ACUGlobalRoutingPolicy"] = `{"profilePolicy":"custom_allowlist","allowedProfileIds":["p1","p2"]}`
	updated, err := ResolveACUEffectiveRoutingPolicy(token)
	require.NoError(t, err)
	require.Equal(t, []string{"p1", "p2"}, updated.AllowedProfileIDs)
	require.False(t, token.ACUProfileLimitsEnabled)
	require.Empty(t, token.ACUProfileLimits)
}

func TestResolveACUEffectiveRoutingPolicyRejectsEmptyIntersection(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{"ACUGlobalRoutingPolicy": `{"modelPolicy":"custom_allowlist","allowedModelIds":["a"]}`}
	_, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACUAllowedCandidateIDs: []string{"b"},
	})
	require.ErrorContains(t, err, "intersection is empty")
}

func TestNormalizeACURoutingPreferenceDefaultsAndRejectsInvalid(t *testing.T) {
	value, err := NormalizeACURoutingPreference("")
	require.NoError(t, err)
	require.Equal(t, "balanced", value)
	_, err = NormalizeACURoutingPreference("xhigh")
	require.Error(t, err)
}

func TestNormalizeACURoutingScopeClearsInactiveAllowlists(t *testing.T) {
	scope, err := NormalizeACURoutingScope(ACURoutingScope{
		Policy:            ACURoutingPolicyAll,
		AllowedModelIDs:   []string{"gemini-2.5-flash"},
		ProfilePolicy:     ACURoutingPolicyAll,
		AllowedProfileIDs: []string{"lucen-gemini-openai-030:gemini-2.5-flash:responses"},
	})
	require.NoError(t, err)
	require.Empty(t, scope.AllowedModelIDs)
	require.Empty(t, scope.AllowedProfileIDs)
}

func TestNormalizeACURoutingScopeDerivesAutoCandidatesFromModelAccess(t *testing.T) {
	scope, err := NormalizeACURoutingScope(ACURoutingScope{
		ModelAccess: map[string]string{
			"mimo-v2.5":   ACUModelAccessExplicit,
			"gpt-5.6-sol": ACUModelAccessAuto,
			"kimi-k2.6":   ACUModelAccessDisabled,
		},
		ProfilePolicy: ACURoutingPolicyAll,
	})
	require.NoError(t, err)
	require.Equal(t, ACURoutingPolicyCustom, scope.Policy)
	require.Equal(t, []string{"gpt-5.6-sol"}, scope.AllowedModelIDs)
	require.Equal(t, ACUModelAccessExplicit, scope.ModelAccess["mimo-v2.5"])
	require.Equal(t, ACUModelAccessDisabled, scope.ModelAccess["kimi-k2.6"])
}

func TestSanitizeACUGlobalRoutingScopeRemovesProfilesMissingFromRouterPool(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"range":"24h",
			"supplyStrategy":"balanced",
			"scenario":"standard",
			"protocol":"all",
			"profiles":[
				{
					"executionProfileId":"active-profile",
					"canonicalModel":"gpt-5.6-luna",
					"protocol":["responses"],
					"enabled":true,
					"administratorAllowed":true,
					"autoRouteEnabled":true
				},
				{
					"executionProfileId":"disabled-profile",
					"canonicalModel":"gpt-5.6-luna",
					"protocol":["responses"],
					"enabled":false,
					"administratorAllowed":true,
					"autoRouteEnabled":true
				}
			],
			"history":[],
			"cooldownIntervals":[],
			"probeHistory":[],
			"supplyInventory":[],
			"modelPool":[]
		}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	scope := ACURoutingScope{
		Policy:            ACURoutingPolicyAll,
		ProfilePolicy:     ACURoutingPolicyCustom,
		AllowedProfileIDs: []string{"active-profile", "disabled-profile", "stale-profile"},
	}
	sanitized, removed, err := SanitizeACUGlobalRoutingScopeAgainstPool(
		context.Background(),
		scope,
	)
	require.NoError(t, err)
	require.Equal(t, []string{"active-profile"}, sanitized.AllowedProfileIDs)
	require.Equal(t, []string{"disabled-profile", "stale-profile"}, removed)
}

func TestValidateACURoutingScopeAllowsExplicitProfileOutsideAutoModelAllowlist(t *testing.T) {
	clearACUChannelMonitorCache()
	t.Cleanup(clearACUChannelMonitorCache)
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"profiles":[{
				"executionProfileId":"auto:gpt-5.6-sol:responses",
				"canonicalModel":"gpt-5.6-sol","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":true
			},{
				"executionProfileId":"explicit:mimo-v2.5:chat_completions",
				"canonicalModel":"mimo-v2.5","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":false
			}],
			"history":[],"cooldownIntervals":[],"probeHistory":[],
			"supplyInventory":[],"modelPool":[{
				"modelId":"gpt-5.6-sol","autoRouteEnabled":true
			}]
		}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	err := ValidateACURoutingScopeAgainstPool(context.Background(), ACURoutingScope{
		Policy:            ACURoutingPolicyCustom,
		AllowedModelIDs:   []string{"gpt-5.6-sol"},
		ProfilePolicy:     ACURoutingPolicyCustom,
		AllowedProfileIDs: []string{"explicit:mimo-v2.5:chat_completions"},
	})
	require.NoError(t, err)
}

func TestCurrentGlobalACUProfileIDsIncludesExplicitModelsAndAppliesProfilePolicy(t *testing.T) {
	clearACUChannelMonitorCache()
	t.Cleanup(clearACUChannelMonitorCache)
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{
		"ACUGlobalRoutingPolicy": `{
			"modelAccess":{
				"gpt-5.6-sol":"auto",
				"mimo-v2.5":"explicit",
				"kimi-k2.6":"disabled"
			},
			"profilePolicy":"custom_allowlist",
			"allowedProfileIds":[
				"auto:gpt-5.6-sol:responses",
				"explicit:mimo-v2.5:chat_completions",
				"disabled:kimi-k2.6:messages"
			]
		}`,
	}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"profiles":[{
				"executionProfileId":"auto:gpt-5.6-sol:responses",
				"canonicalModel":"gpt-5.6-sol","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":true
			},{
				"executionProfileId":"explicit:mimo-v2.5:chat_completions",
				"canonicalModel":"mimo-v2.5","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":false
			},{
				"executionProfileId":"disabled:kimi-k2.6:messages",
				"canonicalModel":"kimi-k2.6","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":false
			},{
				"executionProfileId":"not-allowed:mimo-v2.5:responses",
				"canonicalModel":"mimo-v2.5","enabled":true,
				"administratorAllowed":true,"autoRouteEnabled":false
			}],
			"history":[],"cooldownIntervals":[],"probeHistory":[],
			"supplyInventory":[],"modelPool":[]
		}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	profileIDs, err := CurrentGlobalACUProfileIDs(context.Background())
	require.NoError(t, err)
	require.Equal(t, []string{
		"auto:gpt-5.6-sol:responses",
		"explicit:mimo-v2.5:chat_completions",
	}, profileIDs)
}

func TestResolveACUEffectiveRoutingPolicyKeepsPublicModelLimitsOutOfAutoScope(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}

	policy, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ModelLimitsEnabled:     true,
		ModelLimits:            "acu-auto,mimo-v2.5",
		ACUAllowedCandidateIDs: []string{"gpt-5.6-sol"},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"gpt-5.6-sol"}, policy.AllowedModelIDs)
	require.NotContains(t, policy.AllowedModelIDs, "mimo-v2.5")
}

func TestACUCanonicalAllowedModelIDsFiltersVirtualModels(t *testing.T) {
	require.Equal(t, []string{"gpt-5.6-sol"}, ACUCanonicalAllowedModelIDs("acu-auto, acu-high, gpt-5.6-sol, gpt-5.6-sol"))
}

func TestACUCandidateModelIDs(t *testing.T) {
	require.Equal(t, []string{"gpt-5.6-luna", "gpt-5.6-sol"}, ACUCandidateModelIDs([]string{
		"gpt-5.6-sol@high",
		"gpt-5.6-luna@max",
		"gpt-5.6-sol",
	}))
}

func TestResolveACUEffectiveRoutingPolicyTreatsOnlyVirtualLimitsAsAll(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}
	policy, err := ResolveACUEffectiveRoutingPolicy(&model.Token{ModelLimitsEnabled: true, ModelLimits: "acu-auto,acu-high"})
	require.NoError(t, err)
	require.Equal(t, ACURoutingPolicyAll, policy.RoutingPolicy)
	require.Empty(t, policy.AllowedModelIDs)
}

func TestResolveACUEffectiveRoutingPolicyUsesPresetAndCustomBias(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{
		"ACURoutingUtilityConfig": `{"schemaVersion":"acu-routing-utility-config-v1","formulaMode":"shadow","qualityPresets":{"economy":-70,"balanced":5,"quality":75},"acuHighBiasOffset":35,"modelCostLogScale":3,"supplyPresets":{"lowest_cost":{"cost":100,"speed":0,"reliability":0},"balanced":{"cost":40,"speed":25,"reliability":35},"low_latency":{"cost":10,"speed":80,"reliability":10},"high_reliability":{"cost":10,"speed":10,"reliability":80}},"profileCostLogScale":2,"profileSpeedLogScale":4,"latency":{"windowHours":24,"longContextThresholdTokens":100000,"minimumSamples":5,"unknownLatencyMultiplier":1.2},"reliability":{"windowHours":24,"minimumSamples":5,"unknownDefault":0.75,"degradedMultiplier":0.85},"workPhaseBiasOffsets":{"inspection":-10,"general":0,"implementation":0,"verification":0,"planning":10,"recovery":20}}`,
	}
	preset, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACURoutingPreference: "economy", ACUSupplyStrategy: "low_latency",
	})
	require.NoError(t, err)
	require.Equal(t, -70, preset.QualityBias)
	require.Equal(t, map[string]int{"economy": -70, "balanced": 5, "quality": 75}, preset.QualityPresets)
	require.Equal(t, "low_latency", preset.SupplyStrategy)
	require.Equal(t, []int{10, 80, 10}, []int{preset.SupplyCostWeight, preset.SupplySpeedWeight, preset.SupplyReliabilityWeight})
	require.Equal(t, "shadow", preset.FormulaMode)

	customBias := -13
	custom, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACURoutingPreference: "quality", ACUQualityBias: &customBias,
	})
	require.NoError(t, err)
	require.Equal(t, -13, custom.QualityBias)
}

func TestNormalizeACURoutingUtilityConfigRejectsInvalidContracts(t *testing.T) {
	config := defaultACURoutingUtilityConfig()
	config.FormulaMode = "shadow"
	_, err := NormalizeACURoutingUtilityConfig(config)
	require.NoError(t, err)

	invalidWeights := config
	invalidWeights.SupplyPresets = map[string]ACUSupplyWeights{}
	for name, weights := range config.SupplyPresets {
		invalidWeights.SupplyPresets[name] = weights
	}
	invalidWeights.SupplyPresets["balanced"] = ACUSupplyWeights{Cost: 40, Speed: 25, Reliability: 34}
	_, err = NormalizeACURoutingUtilityConfig(invalidWeights)
	require.ErrorContains(t, err, "supply preset")

	invalidBias := config
	invalidBias.QualityPresets = map[string]int{"economy": -101, "balanced": 0, "quality": 60}
	_, err = NormalizeACURoutingUtilityConfig(invalidBias)
	require.ErrorContains(t, err, "quality preset")
}

func TestLegacyTokenDefaultsToBalancedUtility(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}
	policy, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.Equal(t, "balanced", policy.RoutingPreference)
	require.Equal(t, "balanced", policy.SupplyStrategy)
	require.Equal(t, 20, policy.QualityBias)
	require.Equal(t, "legacy", policy.FormulaMode)
	require.NotEmpty(t, policy.RoutingUtilityVersion)
}

func TestQualitySatisfactionVersionInvalidatesRoutingUtilityVersion(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	config := defaultACURoutingUtilityConfig()
	config.FormulaMode = "active"
	config.QualityPresets = map[string]int{"economy": 0, "balanced": 40, "quality": 70}
	raw, err := common.Marshal(config)
	require.NoError(t, err)
	common.OptionMap = map[string]string{"ACURoutingUtilityConfig": string(raw)}

	policy, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.NotEqual(t, "acu-routing-utility-v1-94cb7f76d42bd7cb", policy.RoutingUtilityVersion)
}

func TestNormalizeACUCandidatePolicyPreservesExplicitNeutralAndValidatesBounds(t *testing.T) {
	candidateIDs, scores, err := NormalizeACUCandidatePolicy(
		[]string{"gpt-5.6-luna", "gpt-5.6-luna@max"},
		map[string]float64{"gpt-5.6-luna": 80, "gpt-5.6-luna@max": 150.5},
		[]string{"gpt-5.6-luna"},
		true,
	)
	require.NoError(t, err)
	require.Equal(t, []string{"gpt-5.6-luna", "gpt-5.6-luna@max"}, candidateIDs)
	require.Equal(t, map[string]float64{"gpt-5.6-luna": 80, "gpt-5.6-luna@max": 150.5}, scores)
	_, scores, err = NormalizeACUCandidatePolicy(nil, map[string]float64{"gpt-5.6-luna": 100}, nil, false)
	require.NoError(t, err)
	require.Equal(t, map[string]float64{"gpt-5.6-luna": 100}, scores)

	for _, invalid := range []map[string]float64{
		{"gpt-5.6-luna@max": -1},
		{"gpt-5.6-luna@max": 201},
		{"gpt-5.6-luna@max": math.NaN()},
		{"gpt-5.6-luna@max": math.Inf(1)},
		{"acu-auto": 150},
		{"invalid model": 150},
	} {
		_, _, err = NormalizeACUCandidatePolicy(nil, invalid, nil, false)
		require.Error(t, err)
	}
	_, _, err = NormalizeACUCandidatePolicy(
		[]string{"gpt-5.6-luna"},
		map[string]float64{"gpt-5.6-luna@max": 150},
		[]string{"gpt-5.6-luna"},
		true,
	)
	require.ErrorContains(t, err, "outside the candidate allowlist")
}

func TestCandidatePolicyAndPreferencesAffectSeparateVersions(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}

	neutral, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	allowed, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACUAllowedCandidateIDs: []string{"gpt-5.6-luna@max"},
	})
	require.NoError(t, err)
	preferred, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACUAllowedCandidateIDs:       []string{"gpt-5.6-luna@max"},
		ACUCandidatePreferenceScores: map[string]float64{"gpt-5.6-luna@max": 150.5},
	})
	require.NoError(t, err)

	require.Equal(t, defaultACUCandidatePreferenceScores(), neutral.CandidatePreferenceScores)
	require.NotEqual(t, neutral.RoutingPolicyVersion, allowed.RoutingPolicyVersion)
	require.Equal(t, allowed.RoutingPolicyVersion, preferred.RoutingPolicyVersion)
	require.NotEqual(t, allowed.RoutingUtilityVersion, preferred.RoutingUtilityVersion)
}

func TestDefaultCandidatePreferencesAreInheritedAndTokenScoresOverride(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	config := defaultACURoutingUtilityConfig()
	config.FormulaMode = "active"
	config.DefaultCandidatePreferenceScores = map[string]float64{
		"gpt-5.6-luna":     118,
		"gpt-5.6-sol@high": 90,
	}
	raw, err := common.Marshal(config)
	require.NoError(t, err)
	common.OptionMap = map[string]string{"ACURoutingUtilityConfig": string(raw)}

	inherited, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.Equal(t, config.DefaultCandidatePreferenceScores, inherited.CandidatePreferenceScores)

	overridden, err := ResolveACUEffectiveRoutingPolicy(&model.Token{
		ACUAllowedCandidateIDs:       []string{"gpt-5.6-luna"},
		ACUCandidatePreferenceScores: map[string]float64{"gpt-5.6-luna": 100},
	})
	require.NoError(t, err)
	require.Equal(t, map[string]float64{"gpt-5.6-luna": 100}, overridden.CandidatePreferenceScores)

	config.DefaultCandidatePreferenceScores["gpt-5.6-luna"] = 119
	raw, err = common.Marshal(config)
	require.NoError(t, err)
	common.OptionMap["ACURoutingUtilityConfig"] = string(raw)
	changed, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.Equal(t, inherited.RoutingPolicyVersion, changed.RoutingPolicyVersion)
	require.NotEqual(t, inherited.RoutingUtilityVersion, changed.RoutingUtilityVersion)
}

func TestDefaultProfilePreferencesAreInheritedFilteredAndVersioned(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	config := defaultACURoutingUtilityConfig()
	config.FormulaMode = "active"
	config.DefaultProfilePreferenceScores = map[string]float64{
		"cockpit:gpt-5.6-sol:responses": 125.5,
		"wawazz:gpt-5.6-sol:responses":  100,
	}
	raw, err := common.Marshal(config)
	require.NoError(t, err)
	common.OptionMap = map[string]string{
		"ACURoutingUtilityConfig": string(raw),
		"ACUGlobalRoutingPolicy":  `{"profilePolicy":"custom_allowlist","allowedProfileIds":["cockpit:gpt-5.6-sol:responses"]}`,
	}

	inherited, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.Equal(t, map[string]float64{
		"cockpit:gpt-5.6-sol:responses": 125.5,
	}, inherited.ProfilePreferenceScores)
	initialVersion := inherited.RoutingUtilityVersion

	config.DefaultProfilePreferenceScores["cockpit:gpt-5.6-sol:responses"] = 130
	raw, err = common.Marshal(config)
	require.NoError(t, err)
	common.OptionMap["ACURoutingUtilityConfig"] = string(raw)
	changed, err := ResolveACUEffectiveRoutingPolicy(&model.Token{})
	require.NoError(t, err)
	require.NotEqual(t, initialVersion, changed.RoutingUtilityVersion)
	require.Equal(t, inherited.RoutingPolicyVersion, changed.RoutingPolicyVersion)
}

func TestNormalizeProfilePreferencesUsesImplicitNeutralAndValidatesBounds(t *testing.T) {
	scores, err := NormalizeACUProfilePreferenceScores(map[string]float64{
		"cockpit:gpt-5.6-sol:responses": 125.5,
		"wawazz:gpt-5.6-sol:responses":  100,
	})
	require.NoError(t, err)
	require.Equal(t, map[string]float64{
		"cockpit:gpt-5.6-sol:responses": 125.5,
	}, scores)

	for _, invalid := range []map[string]float64{
		{"": 120},
		{"invalid profile": 120},
		{"cockpit:gpt-5.6-sol:responses": -1},
		{"cockpit:gpt-5.6-sol:responses": 201},
		{"cockpit:gpt-5.6-sol:responses": math.NaN()},
	} {
		_, err = NormalizeACUProfilePreferenceScores(invalid)
		require.Error(t, err)
	}
}
