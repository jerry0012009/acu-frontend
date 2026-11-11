# Blue/Green Startup Contract

Production adoption is coordinated by the canonical Router repository's
`docs/operations/acu-blue-green-release.md`. Adding these image capabilities
does not switch production or make a legacy release interruption-free.

`SKIP_AUTO_MIGRATE=true` disables main/log database automatic migrations and
startup rewriting of built-in authorization/default frontend options. It does
not create missing tables or seed a fresh installation. Apply and validate
compatible migrations separately before starting a candidate.

HTTP slots use the existing `NODE_TYPE=slave` mode. One independently managed,
non-public master process retains background jobs, with migrations disabled.
Do not start two singleton-job owners, or retire the worker with every HTTP
release. Worker/API contracts must remain compatible across deployed versions.

Images now expose `io.acu.schema.version` and `io.acu.release.features` labels.
The latter advertises migration-free startup and static export. Schema labels
are compatibility evidence, not a substitute for a reviewed migration plan.

The Docker final stage includes `/opt/acu-web/static` from the same frontend
build embedded in the Go executable. The publisher retains content-addressed
assets outside the application container so open browser tabs can still load
their old chunks. It rejects different content under an existing retained URL.
Do not put production credentials in exported assets or discard old chunks
while supported browser sessions may still reference them.
