import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { parseScheduledRunTime } from "../../src/runs/background/scheduled-runs.ts";
import {
  parseSubagentCatalogCall,
  prepareSubagentCatalogArguments,
} from "../../src/extension/subagent-command-catalog.ts";
import { runWorkflowScript, validateWorkflowScript } from "../../src/workflows/scripted-workflow.ts";

type FixtureValue = string | number | boolean | null | FixtureValue[] | { [key: string]: FixtureValue };

interface FixtureCall {
  action: string;
  input?: { [key: string]: FixtureValue };
  [key: string]: FixtureValue | undefined;
}

interface ObservedFailureFixture {
  sourceId: string;
  observedAt: string;
  boundary: "envelope" | "action-fields" | "canonical-input" | "schedule-time" | "workflow";
  fields?: string[];
  call: FixtureCall;
}

// SAFETY: this frozen test fixture is reviewed in-repository and its complete structure is exercised below.
const fixtures = JSON.parse(
  fs.readFileSync(
    new URL("../fixtures/catalog-observed-failure-fixtures.json", import.meta.url),
    "utf-8",
  ),
) as ObservedFailureFixture[];

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

void describe("observed post-catalog failure replays", () => {
  void it("keeps the frozen corpus complete and source-addressable", () => {
    assert.equal(fixtures.length, 51);
    assert.equal(fixtures.filter(({ boundary }) => boundary === "envelope").length, 20);
    assert.equal(fixtures.filter(({ boundary }) => boundary === "action-fields").length, 13);
    assert.equal(fixtures.filter(({ boundary }) => boundary === "canonical-input").length, 11);
    assert.equal(fixtures.filter(({ boundary }) => boundary === "schedule-time").length, 2);
    assert.equal(fixtures.filter(({ boundary }) => boundary === "workflow").length, 5);
    for (const fixture of fixtures) {
      assert.ok(fixture.sourceId.length > 0);
      assert.match(fixture.observedAt, /^2026-09-/);
    }
  });

  void it("rejects every observed envelope, action-field, and canonical-input shape", () => {
    for (const fixture of fixtures) {
      if (fixture.boundary === "envelope") {
        const fields = fixture.fields ?? [];
        assert.throws(
          () => prepareSubagentCatalogArguments(fixture.call),
          new RegExp(`${fields.map(escapePattern).join(".*")}.*under 'input'`),
          fixture.sourceId,
        );
        continue;
      }
      if (fixture.boundary !== "action-fields" && fixture.boundary !== "canonical-input") continue;
      const parsed = parseSubagentCatalogCall(prepareSubagentCatalogArguments(fixture.call));
      assert.equal(parsed.ok, false, fixture.sourceId);
      if (!parsed.ok && fixture.boundary === "action-fields") {
        for (const field of fixture.fields ?? [])
          assert.ok(parsed.error.includes(field), fixture.sourceId);
      }
    }
  });

  void it("keeps observed invalid schedule delays rejected after catalog parsing", () => {
    for (const fixture of fixtures.filter(({ boundary }) => boundary === "schedule-time")) {
      const parsed = parseSubagentCatalogCall(prepareSubagentCatalogArguments(fixture.call));
      assert.equal(parsed.ok, true, fixture.sourceId);
      // SAFETY: schedule-time fixtures are frozen above and this branch selects their string `at` field.
      const at = fixture.call.input?.at as string;
      assert.throws(
        () => parseScheduledRunTime(at, 0),
        /Use a one-shot delay such as "\+10m" or an ISO timestamp with timezone/,
        fixture.sourceId,
      );
    }
  });

  void it("rejects all five observed workflow shapes before any child launch", async () => {
    for (const fixture of fixtures.filter(({ boundary }) => boundary === "workflow")) {
      // SAFETY: workflow fixtures are frozen above and this branch selects their string workflow script.
      const script = fixture.call.input?.workflowScript as string;
      assert.equal(validateWorkflowScript(script).ok, false, fixture.sourceId);
      const launched: string[] = [];
      await assert.rejects(
        runWorkflowScript({
          script,
          async launch(key) {
            launched.push(key);
            return { key, ok: true, output: "unexpected", artifactPaths: [] };
          },
          async status(key) {
            return { key, ok: true, output: "unexpected", artifactPaths: [] };
          },
        }),
        /no children launched/,
        fixture.sourceId,
      );
      assert.deepEqual(launched, [], fixture.sourceId);
    }
  });
});
