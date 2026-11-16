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

Production release `bg-20261116T070856-5792667e` completed on
`8bf1fb3d8cb023b92c649c0fe9ea9afcdb602db4`, candidate image
`sha256:48925194f0e8dd5849300431cad6a5e0b0ae12ddcefa9e2113558928e256ad0b`.
Candidate full-options request was 742ms. Four public requests were
1285/482/435/1411ms versus the measured old 15822/30954ms. All return the
same 71 sorted model IDs and same selected key. Real browser opened the text
model selector and displayed 71 options. Candidate/public standard three
protocol streams and unique settlement passed. Maintenance and read-only
acceptance sessions revoked, reuse rejected 401 and private auth files removed.
Evidence: `/root/jerry/exports/conversation-fast-models-20261116/` and
`/tmp/acu-fast-model-list-public.png`. No cache warming or server-side timer
is needed to obtain the list; no Router/Runtime release occurred.
