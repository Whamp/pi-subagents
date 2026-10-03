# Inspect and control running work

The operator can see delegated work, inspect its output, and direct an exact child without losing control of unrelated runs.

## Sub-features

- `inspect-status`: inspect a run and its final output.
- `inspect-fleet`: browse current work and transcripts.
- `control-steer-stop`: steer or stop an exact owned run or child.

## How to get to it (user POV)

- Ask for current async runs or call the model-facing status catalog action. Only final targeted status is automated here.
- Open `/subagents-fleet` in the TUI and use the inspector controls. Not automated.
- Use `/subagents-steer` and `/subagents-stop` slash commands. Not automated.
- RPC hosts use `/subagents-inspect-rpc` and in-process event-bus RPC status/control. Not automated.

## Driving it with verify-pi-subagents

Preconditions: for automated final status, use the [background recipe](compact-catalog-background.md). For controls, start a separate operator-authorized disposable Pi session with an owned long-running child and retain its exact run id.

- **Status baseline.** Run `"$HELPER" drive --pi-sdk "$PI_SDK" --evidence "$EVIDENCE"`. The real status tool result and persisted status both show completion and marker output.
- **Manual fleet.** Enter `/subagents-fleet` in that disposable TUI. Record the displayed run id and transcript. Require the same child's task/output, not an unrelated session's run.
- **Manual steer.** Enter `/subagents-steer <run-id> Return STEERED_MARKER`. Capture the command, delivery result, and later child transcript containing that marker.
- **Manual stop.** Enter `/subagents-stop <run-id>` for a still-active disposable run. Inspect status and terminal artifacts. Require stopped state and observed process closure, with unrelated work unchanged.
- **Manual RPC inspection.** Send `{"id":"inspect","type":"prompt","message":"/subagents-inspect-rpc verify <run-id> --lines 20"}` on the owned Pi RPC session's stdin. Capture the correlated `PI_SUBAGENT_INSPECT_JSON:` widget reply. Follow the [inspection protocol](../../../../docs/observability.md#host-inspection-protocol-rpc) for exact bounds.
- **Supplemental contracts.** Run `node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test test/unit/subagent-control.test.ts` from the checkout. These tests are not live TUI or RPC proof.

## Gotchas

- The helper child finishes too fast for a useful steer or stop test. Those manual paths need a separate long-lived fixture; they are coverage gaps until exercised.
- Fleet display keys are not async run ids. Use the actual id from a launch/status result.
- Stop cancels work. Interrupt pauses where supported. Neither proves retained-child resume.
- The user's main Pi session is not a verification fixture.
