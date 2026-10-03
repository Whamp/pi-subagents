# Keep upstream behavior behind the compact catalog

Use this checklist for each upstream port. Read [VISION.md](../../../../VISION.md) before choosing scope. The feature map identifies the user entry points that need proof.

## Pin the comparison

Run from the checkout root before implementation:

```sh
git fetch --multiple origin upstream
FORK_BASE=$(git rev-parse HEAD)
UPSTREAM_HEAD=$(git rev-parse upstream/main)
git merge-base "$FORK_BASE" "$UPSTREAM_HEAD"
git log --oneline "$FORK_BASE..$UPSTREAM_HEAD"
```

Fetch updates refs and uses the network. It does not merge code. Keep the resolved SHAs in the run's evidence directory. Commit counts do not establish capability gaps. A port can already exist under a different commit, as the Pi 1.0.0 alias fix does.

Read the relevant upstream diff and changelog. For each proposed capability, record its user entry point, acceptance condition, fork status, and source commit. Use the shared program directory from Launch. Keep the decision record outside the worktree so later lanes use the same record.

## Preserve the boundary

- The model-facing root and child-fanout tools keep `{action,input}`. Their public declarations contain only those two fields.
- The catalog validates operation-specific input before forwarding it to the canonical executor. Port upstream options into the operation table and canonical schema together.
- RPC, slash commands, and trusted host callers retain their canonical flat requests. They are not model-facing catalog callers.
- Child mutation restrictions and trusted host-resource authority remain enforced. A capability is not parity if its permissions change silently.
- Workflow API removals are deliberate cutovers. Migrate catalog fields, model guidance, examples, host callers, schedules, and tests together. Upstream 0.74's removal of workflowScript/workflowScriptPath is not a documentation-only update.

## Prove each change

1. Run this skill on the pinned fork baseline. Keep the real declaration, actions, results, and cleanup proof.
2. Implement one bounded capability in an isolated Lane. Use the upstream runtime behind the catalog rather than adding a second executor.
3. Add a failing regression for the actual gap. Verify the fix with the mapped user entry points it affects. A status result does not certify stop, resume, RPC, or Fleet.
4. Repeat Doctor, Drive, and Cleanup on the candidate. Require the compact declaration and real child completion. Update the helper only when an intentional behavior change makes its expectation obsolete.
5. Run the affected tests and the project's typecheck/build gates. Run the required code-quality checks against the pinned fork base. Report skips and inherited failures separately.
6. Obtain an independent review against the final patch. Recheck its identity after any rebase. Follow the owner's publication policy. Updating the installed extension is a separate action from publishing source.

The helper's serialized schema sizes are character measurements. Compare the actual provider-visible declarations on the same Pi host. Use the paired evaluation described in [test/eval/README.md](../../../../test/eval/README.md) only with approved model capacity. It measures contract usability with fake effects. It does not replace real-child proof. Total-session token cost and cache behavior require their own measurements.

## Continue from the verified baseline

The initial worker run used npm Pi 1.0.0. The independent rerun uses 1.0.1 after the host changed during verification. Both use the fork's separately ported background alias fix. The driver proves model-issued activation, focused execute help, background launch, waiting, targeted status, persistent output, and observed runner exit.

For the next token-focused port, inspect upstream's advertised-agent prompt-cache fix from release 0.73.1. It moves agent advertising into a prompt section rather than rewriting the complete system prompt. Verify prompt/cache behavior separately; passing the catalog character budget alone does not prove that improvement.

Maintain a capability checklist for the remaining runtime, safety, workflow, observability, and platform changes. Advance each item's status only after its affected user path has evidence. Do not mark the fork fully synchronized because one baseline passes.
