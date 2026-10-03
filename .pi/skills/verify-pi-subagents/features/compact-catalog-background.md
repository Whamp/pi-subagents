# Compact catalog and background delegation

An authorized parent discovers delegation tools, launches a child without blocking on its work, and receives an inspectable result.

## Sub-features

- `catalog-activate`: the loader exposes the compact catalog on the next model request.
- `catalog-discover`: focused help lists the accepted execute fields.
- `background-complete`: one real detached child returns a persisted marker and observed terminal proof.

## How to get to it (user POV)

- Ask Pi to delegate a task in the background. This model-issued npm CLI path is automated.
- Use prompt shortcuts such as `/parallel-review` or `/review-loop` for broader delegation. Not covered here.
- Extension hosts can launch through event-bus RPC. External runners and standalone packages are separate entry points, not covered here.

## Driving it with verify-pi-subagents

Preconditions: the [skill's Doctor](../SKILL.md#doctor) passes for a fresh evidence directory and npm Pi 1.0.x. Require a successful drive on the exact recorded patch version.

- **Activate and discover.** Run `"$HELPER" drive --pi-sdk "$PI_SDK" --evidence "$EVIDENCE"`. `observer.jsonl` records real `subagents_enable({})` followed by `subagent({action:"help",input:{topic:"contract:execute"}})` calls and results.
- **Launch.** The same drive issues `subagent({action:"execute",input:{agent:"verification-child",task:"Return PI_SUBAGENTS_VERIFIED_CHILD.",context:"fresh",async:true,model:"subagents-verification/child",acceptance:false,timeoutMs:20000,sessionDir:"<owned scratch>/sessions",output:false}})`. The artifact contains the actual absolute sessionDir, asyncId, and asyncDir.
- **Observe completion.** The model issues `bg_wait({id:"<returned asyncId>",timeoutMs:25000,stopOnAttention:false})`, then `subagent({action:"status",input:{id:"<returned asyncId>",view:"transcript",lines:20}})`. Require `proof.json` with distinct PIDs, complete status, marker output, persisted child sessions, and observed runner exit `0`.
- **Retain proof.** Require `result.json` and `cleanup.json` with `ok:true`. The copied `persistent/` tree remains after scratch is removed.

## Gotchas

- Faux parent and child responses test the real integration path, not natural-language model judgment or provider authentication.
- Schema budgets count serialized package-tool characters, not tokenizer output.
- Native completion notification alone is not terminal proof. This recipe explicitly waits and checks runner exit artifacts.
- A passed single child does not cover parallel fanout, foreground work, nested delegation, slash shortcuts, RPC launch, standalone packaging, or external providers.
