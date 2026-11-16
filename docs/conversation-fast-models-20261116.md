# Fast Conversation Model List

The text model picker still used GetACURoutingCatalog, which loads full channel
monitoring (history, probes and routing scores). Public options baseline measured
15822ms for 71 models. Model discovery needs configuration, not monitoring.

GetACUConversationModels now reuses globalACUProfileConfiguration and the existing
profile configuration endpoint. It reads enabled model IDs/protocols, applies
the existing global model policy, Key model/profile scopes and group abilities,
deduplicates and sorts the result. No new cache/registry, upstream probes,
permission changes or Router/client release is introduced. Direct production
configuration endpoint baseline was 320ms. Final public options latency must be
measured after deployment rather than inferred from this internal measurement.

Regression first failed because the handler requested channel-monitor. It now
passes using only execution-profiles and checks duplicate removal, disabled
Profiles, Messages-native supply, Key model/profile limits and acu-auto.
Existing default-Key/error preservation tests remain. Frontend assets are
unchanged, and the release scope is only acu-frontend via canonical blue/green.
