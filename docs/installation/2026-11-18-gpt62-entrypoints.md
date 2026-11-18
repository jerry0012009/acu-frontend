# GPT-6.2 Client Entrypoints

Claude ACU Unix/PowerShell model menus, generated launchers and validation now
accept exact `gpt-6.2-sol` and `gpt-6.2-astra`. Codex embedded launcher,
installers and 19-model catalog match the already published Router assets.
CC Switch mappings include both exact IDs with 1050000 context. Existing
defaults, credentials, cloud model restrictions and native model selections
are preserved. Runtime 0.1.119 adds the same models to four-Agent one-click
setup, available only when present in the selected Key's actual inventory.

## Production Publication

Console application `78bf513e8fea825b99e7c42bc76305d5d21d87c2`, image
`sha256:2a0cd0c0ed90c96ab7a3f8eb436eed473aacb1cfa580d0224b27ddf029571064`.
Release `bg-20261118T011435-a2e4f43e` completed via the canonical
`release-unit.py` blue/green flow. The same manifest performed the serialized
singleton-worker image handoff; active HTTP and worker are healthy, restart
count 0, `unless-stopped`. Old HTTP exited 0 with restart disabled. No release
rollback. Router, Private and stateful services were not replaced by this task.

Candidate and public phases each passed Chat, Responses and Messages terminal
events, acknowledged usage and unique settlement. These necessary release
checks used the existing acceptance model; no additional GPT-6.2 paid inference
was requested. Maintenance session revoked, reuse rejected 401, token file
removed. The latest Router revision at inspection is
`8ecbc6b3b2699a9329df455ce4907be58c43f76d`, unchanged during this publication.

Both `api.acucompute.com` and `acu-api-direct.jerrypsy.top` match all six changed
Claude/Codex installer, launcher and catalog files by normalized SHA256.
Candidate embedded files also matched before cutover. Codex binary bootstrappers
were not rebuilt or republished. Public Claude paths can retain a five-minute
browser cache; cache-busted verification confirms the current bytes.

## Verification

- 24 installer/quick-start tests pass, including both Claude model-argument
  forms, repeat installation, credential retention and exact CC Switch IDs.
- Frontend typecheck, affected-file lint/format, production build and shell
  syntax pass. Full-project lint still reports unrelated pre-existing errors;
  the changed files pass the scoped invocation.
- Runtime: 156 Node tests, ordinary Go test/vet, and 32 Playwright combinations
  across four Agents, fresh/existing setup, two themes and 390/1440 widths.
- This host's Claude installer was rerun without upgrading Claude or sending
  inference. Credential, Base URL, native Claude path and saved settings hashes
  are unchanged. Both new IDs passed launcher-only checks in Claude and Codex.
- Runtime native Windows/macOS release validation is tracked in workflow
  https://github.com/jerry0012009/acu-runtime/actions/runs/44213485732 .

Evidence: `/root/jerry/exports/gpt62-entrypoints-20261118`. Runtime source
`f809b5dab6cc43c80dec44ea6d40dbbe0e4cb805`, tag `v0.1.119`. Application revision
above remains authoritative if later documentation advances main.
