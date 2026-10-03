# pi-subagents verification map

Read the matching recipe before driving. Use [Launch and Doctor](../SKILL.md) for the isolated CLI baseline. Each proof names its feature and entry point, captures actions and results, checks persistent side effects, and retains artifacts after cleanup. Report uncovered or skipped paths separately.

## Features

- [Compact catalog and background delegation](compact-catalog-background.md): automated real npm Pi CLI path, deterministic model-service boundary.
- [Inspect and control running work](inspect-control.md): status baseline plus manual Fleet, slash, and RPC coverage gaps.
- [Discover and manage agents](agent-discovery.md): existing contract tests and manual user recipes, not automated here.
- [Run bounded workflows](bounded-workflows.md): existing sandbox tests and manual workflow recipes, not automated here.

## Coverage boundaries

Only the first feature's model-issued CLI path is automated by this skill. Its wait and status calls prove completion, not cancellation, steering, or resume. The helper does not launch external agents, worktrees, packaged standalone binaries, or paid providers.

`npm run test:smoke:tool-activation` is supplemental real SDK activation coverage using installed checkout peers, not the explicit host CLI or detached-child proof. `npm run eval:catalog-models -- --help` describes a paid-provider evaluation with fake runtime effects. It does not prove real children or tool hooks. Read [evaluation constraints](../../../../test/eval/README.md) before approving inference.

`test/smoke/npm-background.mjs` pins Pi 0.86.1 and reuses `standalone-parent.ts` flat calls. These are not valid Pi 1.0.0 verification recipes. Do not count them as current-host coverage or change them as part of this skill.
