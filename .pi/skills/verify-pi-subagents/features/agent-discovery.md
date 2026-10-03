# Discover and manage agents

The operator chooses an available specialist, inspects its contract, and keeps project definitions separate from user definitions.

## Sub-features

- `agents-list`: list available specialists and capabilities.
- `agents-get`: inspect one specialist's effective configuration.
- `agents-manage`: create, update, or disable definitions in an explicit scope.

## How to get to it (user POV)

- Ask Pi to show available subagents. Model catalog actions include `list`, `get`, `create`, `update`, and `disable`.
- Use `/subagents-guide agents` for installed help and the `/subagents` interactive inspector.
- Extension hosts use the documented in-process event-bus RPC management actions. These alternatives are not automated by this skill.

## Driving it with verify-pi-subagents

Preconditions: start an operator-authorized disposable Pi session, activate `subagents_enable({})`, and keep all mutation targets in that session's project scope. The helper does not automate this feature.

- **Manual list.** Request `subagent({action:"list",input:{capabilities:true,agentScope:"project"}})`. Capture the call and result. Require only the intended project specialists.
- **Manual contract.** Request `subagent({action:"get",input:{agent:"verification-child",agentScope:"project"}})` after supplying a project-local verification-child profile. Require its exact tool, model, and extension settings.
- **Manual help.** Enter `/subagents-guide agents`. Capture the returned installed-version guidance. This proves help, not a management mutation.
- **Supplemental contracts.** Run `node --experimental-strip-types --import ./test/support/isolated-temp-root.mjs --test test/unit/agent-management.test.ts test/unit/agent-scope.test.ts test/unit/agent-discovery-cache.test.ts`. Require exit `0`; these filesystem/contract tests do not prove user-issued Pi calls.
- **Mutation gap.** Before testing create/update/disable, read [agent management](../../../../docs/tool-reference.md) for exact catalog contracts using `help` topics `contract:create`, `contract:update`, and `contract:disable`. Retain before/after files plus a second list/get view. No live mutation proof is shipped here.

## Gotchas

- Project definitions win name collisions. Record scope and effective settings rather than assuming a bundled profile was selected.
- The automated background recipe creates a private fixture in scratch. It does not prove the public create/update actions.
- Agent tools do not automatically load the extensions that provide them.
