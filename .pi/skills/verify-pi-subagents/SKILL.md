---
name: verify-pi-subagents
description: Verify pi-subagents through the real npm Pi CLI. Use after delegation or host changes to prove compact-catalog activation and background-child completion, or to identify uncovered user entry points.
---

# Verify pi-subagents

Read the [feature map](features/README.md) before selecting a path. This checkout is the canonical skill source. Keep installed extensions and the user's main session unchanged.

## Launch

Run from the checkout root with Node >=24 on Linux. Install checkout dependencies once with `npm ci --ignore-scripts --no-audit --no-fund` if absent. This install uses the npm registry. It is separate from the offline drive. The helper accepts npm Pi **1.0.x**; it has been driven on 1.0.0 and 1.0.1. It starts a fresh CLI per drive, not a shared server. Future patch versions still need their own successful drive.

Set the explicit host and a fresh evidence path outside scratch:

```sh
PI_SDK=/home/will/.local/share/mise/installs/node/26.10.0/lib/node_modules/@earendil-works/pi-coding-agent
PROGRAM="$HOME/.pi/pstack/programs/pi-subagents/upstream-sync"
mkdir -p "$PROGRAM"
EVIDENCE="$PROGRAM/verification-$(date -u +%Y%m%dT%H%M%SZ)-$$"
HELPER=.pi/skills/verify-pi-subagents/scripts/verify-pi-subagents.mjs
```

Set `EVIDENCE` again for each run. Doctor requires an existing parent directory and a fresh evidence basename. Prior proof stays in place.

## Doctor

```sh
"$HELPER" doctor --pi-sdk "$PI_SDK" --evidence "$EVIDENCE"
```

Require exit `0` and `ok:true`. Doctor reads host metadata, the actual package bin, dependencies, paths, and Linux process access. It does not start Pi, write files, load credentials, install packages, or use the network. It checks readiness for a fresh run, not a running session.

## Drive

```sh
"$HELPER" drive --pi-sdk "$PI_SDK" --evidence "$EVIDENCE"
```

Require exit `0`, `result.json` with `ok:true`, and `proof.json`. The real CLI loads checkout `index.ts` plus the explicit observer. Model-issued calls activate tools, read `contract:execute`, launch one background child, wait, and inspect status. Separate faux parent and child models replace only the external inference service. Catalog parsing, tools, scheduler, runner, SDK, sessions, and lifecycle artifacts remain real. No paid inference or credential environment is passed.

Other mapped features are supplemental commands or manual recipes, not helper automation. A passing CLI path does not certify slash, RPC, Fleet/TUI, standalone, or external runners.

## Evidence

Evidence survives success and failure. Inspect `manifest.json` (host, git revision/tree/dirty state, hashes, exact CLI argv and isolated environment), `cli.stdout.jsonl`, `cli.stderr.txt`, `cli.exit.json`, `observer.jsonl` (actual provider-visible tools and tool hooks), `proof.json`, `skills.json`, `persistent/`, and `cleanup.json`. Failures also have `failure.json`.

Proof requires action/result pairs, strict `{action,input}` declarations, cold <=5,500 and activated <=10,000 package-tool **characters**, distinct parent/child PIDs, marker output in persisted child sessions and public status, complete state, and observed runner exit `0`. Character counts are not tokens or total-session efficiency measurements. Project skill discovery is checked through the actual Pi loader without an explicit `--skill` shortcut.

## Cleanup

Drive cleans up after every success or failure. Retry bounded, idempotent cleanup with:

```sh
"$HELPER" cleanup --pi-sdk "$PI_SDK" --evidence "$EVIDENCE"
```

Require `cleanup.json` with `ok:true` and evidence still present. Cleanup checks scratch markers and exact recorded PIDs against Linux run-token and birth identity before each signal. It copies persistent scratch evidence before removal. Uncertain identity, symlinks, special files, or unrecorded live processes cause refusal and a remnants report. Inspect that report instead of using process-name kills or deleting unknown paths.

## Helpers

- [verify-pi-subagents.mjs](scripts/verify-pi-subagents.mjs) is the executable driver for the three commands above.
- [verification-observer.ts](scripts/verification-observer.ts) is loaded by the driver's `--extension` argument and by the verification-only child profile. It is not a standalone CLI.
- Run focused structural and subprocess regressions with `node --test .pi/skills/verify-pi-subagents/scripts/verify-pi-subagents.test.mjs`.

For upstream integration, follow the [sync checklist](references/upstream-sync.md). It protects the compact contract while tracking capability gaps. This skill does not migrate workflowScript/workflowScriptPath.

Use `/skill:maintain-verification-skill` when user paths or host support change.
