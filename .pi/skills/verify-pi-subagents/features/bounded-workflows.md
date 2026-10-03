# Run bounded workflows

The operator sequences or fans out focused children under explicit concurrency, spawn, output, and authority limits.

## Sub-features

- `workflow-validate`: reject statically invalid scripts before child launch.
- `workflow-sequence`: pass one completed result into the next step.
- `workflow-fanout`: run a bounded group and retain each result.

## How to get to it (user POV)

- Ask Pi to run a workflow through `subagent` with `{action,input}`.
- Use `/parallel-review`, `/review-loop`, or `/prompt-workflow` prompt entry points where configured.
- Extension hosts invoke canonical executor/RPC calls. Those host calls remain flat internally, unlike model-facing envelopes.
- External runners and packaged standalone workflow launches need distinct proof. No workflow entry point is automated by this helper.

## Driving it with verify-pi-subagents

Preconditions: use an authorized disposable Pi session with a known agent and model. Validate before launch. Live workflow launches can use paid inference unless a separate explicit faux provider fixture is loaded.

- **Manual validate.** Request `subagent({action:"validate",input:{workflowScript:'return await runs.run("first", {agent:"scout",task:"Return READY"})'}})`. Capture the action and validation result. Require `ok:true` and no child launch from validation itself.
- **Manual sequence.** After explicit launch approval, request `subagent({action:"execute",input:{workflowScript:'const first = await runs.run("first", {agent:"scout",task:"Return READY"}); return await runs.run("second", {agent:"scout",task:first.output})',context:"fresh",async:true,maxSubagentSpawnsPerRun:2}})`. Capture both children, ordered results, persistent sessions, and observed terminal proof.
- **Supplemental sandbox contracts.** Run `node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test test/unit/scripted-workflow.test.ts test/unit/subagent-command-catalog.test.ts`. These controlled-effect tests do not prove real fanout or prompt shortcuts.
- **Fanout gap.** Use [workflow recipes](../../../../docs/workflows.md) to select an approved `runs.all` group. Record every child action/result and terminal proof before marking fanout covered.

## Gotchas

- `runs.all` returns an ordered array, not a key map. Keep every launch promise observed.
- Raw scripts cannot acquire named host-resource authority. A successful validation is not permission to launch.
- Runtime rejection can occur after earlier children launch. A passing validate result does not guarantee that execution failures have no side effects.
- workflowScript/workflowScriptPath remain this fork's current API. Their upstream removal is a separate migration decision, not part of this skill.
- Worktrees, acceptance gates, retained resume, external runners, and prompt expansion remain uncovered live paths.
