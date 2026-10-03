import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionAPI,
  SessionShutdownEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Compile } from "typebox/compile";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
} from "@earendil-works/pi-ai";
import type { FauxResponseFactory } from "@earendil-works/pi-ai";

interface ProviderRequestRecord {
  model: string;
  step: number;
  tools: ReturnType<typeof getCurrentTools>;
  characters: number;
}
interface SessionStartRecord {
  argv: string[];
}

const ASYNC_LAUNCH = Compile(
  Type.Object({ asyncId: Type.String({ minLength: 1 }) }, { additionalProperties: true }),
);
const COMPACT_DECLARATION = Compile(
  Type.Object(
    {
      properties: Type.Object(
        {
          action: Type.Object({}, { additionalProperties: true }),
          input: Type.Object({}, { additionalProperties: true }),
        },
        { additionalProperties: false },
      ),
      additionalProperties: Type.Literal(false),
    },
    { additionalProperties: true },
  ),
);

export default function registerVerificationObserver(pi: ExtensionAPI) {
  const evidence = process.env.PI_SUBAGENTS_VERIFY_EVIDENCE;
  const scratch = process.env.PI_SUBAGENTS_VERIFY_SCRATCH;
  assert.ok(evidence && scratch, "Verification observer requires owned run paths");
  const child = process.env.PI_SUBAGENT_CHILD === "1";
  const record = (
    kind: string,
    data:
      | ProviderRequestRecord
      | SessionStartRecord
      | ToolCallEvent
      | ToolResultEvent
      | SessionShutdownEvent,
  ) => {
    fs.appendFileSync(
      path.join(evidence, "observer.jsonl"),
      JSON.stringify({ kind, pid: process.pid, child, ...data }) + "\n",
    );
  };
  let launchId = "";
  pi.on("session_start", () => {
    record("session_start", { argv: process.argv });
  });
  pi.on("tool_call", (event) => {
    record("tool_call", event);
  });
  pi.on("tool_result", (event) => {
    record("tool_result", event);
    assert.equal(event.isError, false, "Verification tool failed");
    if (event.toolName === "subagent" && event.input.action === "execute") {
      const details = ASYNC_LAUNCH.Parse(event.details);
      launchId = details.asyncId;
    }
  });
  pi.on("session_shutdown", (event) => {
    record("session_shutdown", event);
  });

  const faux = fauxProvider({
    provider: "subagents-verification",
    models: [{ id: "parent" }, { id: "child" }],
    tokensPerSecond: 100_000,
  });
  let step = 0;
  const respond: FauxResponseFactory = (...[context, , , model]) => {
    const tools = getCurrentTools(context.messages);
    const packageTools = tools.filter((tool) =>
      ["subagent", "subagents_enable", "bg_wait", "subagent_supervisor"].includes(tool.name),
    );
    const characters = packageTools.reduce((total, tool) => total + JSON.stringify(tool).length, 0);
    record("provider_request", { model: model.id, step, tools, characters });
    if (child) {
      assert.equal(model.id, "child");
      return fauxAssistantMessage("PI_SUBAGENTS_VERIFIED_CHILD");
    }
    assert.equal(model.id, "parent");
    const call = (name: string, input: Parameters<typeof fauxToolCall>[1]) =>
      fauxAssistantMessage(fauxToolCall(name, input), { stopReason: "toolUse" });
    if (step++ === 0) {
      assert.ok(tools.some((tool) => tool.name === "subagents_enable"));
      assert.ok(!tools.some((tool) => tool.name === "subagent"));
      assert.ok(characters <= 5_500, `Cold tool budget exceeded: ${characters}`);
      return call("subagents_enable", {});
    }
    const subagent = tools.find((tool) => tool.name === "subagent");
    assert.ok(subagent);
    assert.ok(
      COMPACT_DECLARATION.Check(subagent.parameters),
      "Invalid provider-visible compact declaration",
    );
    const declaration = COMPACT_DECLARATION.Parse(subagent.parameters);
    assert.deepEqual(Object.keys(declaration.properties).sort(), ["action", "input"]);
    assert.equal(declaration.additionalProperties, false);
    assert.ok(characters <= 10_000, `Activated tool budget exceeded: ${characters}`);
    switch (step) {
      case 2:
        return call("subagent", { action: "help", input: { topic: "contract:execute" } });
      case 3:
        return call("subagent", {
          action: "execute",
          input: {
            agent: "verification-child",
            task: "Return PI_SUBAGENTS_VERIFIED_CHILD.",
            context: "fresh",
            async: true,
            model: "subagents-verification/child",
            acceptance: false,
            timeoutMs: 20_000,
            sessionDir: path.join(scratch, "sessions"),
            output: false,
          },
        });
      case 4:
        assert.ok(launchId, "No async run returned through the real tool hook");
        return call("bg_wait", { id: launchId, timeoutMs: 25_000, stopOnAttention: false });
      case 5:
        return call("subagent", {
          action: "status",
          input: { id: launchId, view: "transcript", lines: 20 },
        });
      default:
        return fauxAssistantMessage("PI_SUBAGENTS_VERIFICATION_PARENT_DONE");
    }
  };
  faux.setResponses(Array.from({ length: 12 }, () => respond));
  pi.registerProvider(faux.provider);
}
