import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fc from "fast-check";
import { prepareSubagentCatalogArguments } from "../../src/extension/subagent-command-catalog.ts";
import { SUBAGENT_ACTIONS } from "../../src/shared/types.ts";
import {
  runWorkflowScript,
  validateWorkflowScript,
} from "../../src/workflows/scripted-workflow.ts";

const PROPERTY_RUNS = 100;
const ZERO_LAUNCH_PROPERTY_RUNS = 50;

const CATALOG_ACTIONS = ["execute", "help", ...SUBAGENT_ACTIONS] as const;
const catalogActionArbitrary = fc.constantFrom(...CATALOG_ACTIONS);
const catalogInputArbitrary = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/),
  fc.jsonValue(),
  { maxKeys: 8 },
);
const catalogEnvelopeArbitrary = fc
  .tuple(catalogActionArbitrary, fc.option(catalogInputArbitrary, { nil: undefined }))
  .map(([action, input]) => (input === undefined ? { action } : { action, input }));
const additionalRootFieldArbitrary = fc
  .stringMatching(/^[a-z][a-z0-9]{0,15}$/)
  .filter((field) => field !== "action" && field !== "input");
const workflowKeyArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/);
const propertyNameWorkflowKeyArbitrary = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,20}$/)
  .filter((key) => !(key in []));
const workflowTaskArbitrary = fc.string({ maxLength: 40 });

const MALFORMED_WORKFLOW_KINDS = [
  "object-form-run",
  "missing-run-params",
  "array-run-params",
  "object-form-all",
  "missing-all-key",
  "number-all-key",
] as const;

type MalformedWorkflowKind = (typeof MALFORMED_WORKFLOW_KINDS)[number];

function malformedWorkflowCall(kind: MalformedWorkflowKind, key: string, task: string): string {
  const keyLiteral = JSON.stringify(key);
  const taskLiteral = JSON.stringify(task);
  switch (kind) {
    case "object-form-run":
      return `return await runs.run({key:${keyLiteral},agent:"worker",task:${taskLiteral}});`;
    case "missing-run-params":
      return `return await runs.run(${keyLiteral});`;
    case "array-run-params":
      return `return await runs.run(${keyLiteral},[]);`;
    case "object-form-all":
      return `return await runs.all({key:${keyLiteral},agent:"worker",task:${taskLiteral}});`;
    case "missing-all-key":
      return `return await runs.all([{agent:"worker",task:${taskLiteral}}]);`;
    case "number-all-key":
      return `return await runs.all([{key:1,agent:"worker",task:${taskLiteral}}]);`;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

void describe("subagent catalog generated properties", () => {
  void it("preserves every valid catalog envelope by reference", () => {
    fc.assert(
      fc.property(catalogEnvelopeArbitrary, (call) => {
        assert.equal(prepareSubagentCatalogArguments(call), call);
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  void it("rejects and names every additional root field", () => {
    fc.assert(
      fc.property(
        catalogEnvelopeArbitrary,
        additionalRootFieldArbitrary,
        fc.jsonValue(),
        (envelope, rootField, value) => {
          const call = { ...envelope, [rootField]: value };
          assert.throws(
            () => prepareSubagentCatalogArguments(call),
            new RegExp(`root field\\(s\\): ${rootField}.*under 'input'`),
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

void describe("workflow validation generated properties", () => {
  for (const malformedKind of MALFORMED_WORKFLOW_KINDS) {
    void it(`rejects ${malformedKind} before an earlier child can launch`, async () => {
      await fc.assert(
        fc.asyncProperty(workflowKeyArbitrary, workflowTaskArbitrary, async (key, task) => {
          const firstKey = `first-${key}`;
          const script = [
            `await runs.run(${JSON.stringify(firstKey)},{agent:"worker",task:${JSON.stringify(task)}});`,
            malformedWorkflowCall(malformedKind, key, task),
          ].join("\n");
          assert.equal(validateWorkflowScript(script).ok, false);

          const launched: string[] = [];
          await assert.rejects(
            runWorkflowScript({
              script,
              async launch(launchedKey) {
                launched.push(launchedKey);
                return {
                  key: launchedKey,
                  ok: true,
                  output: "unexpected",
                  artifactPaths: [],
                };
              },
              async status(statusKey) {
                return {
                  key: statusKey,
                  ok: true,
                  output: "unexpected",
                  artifactPaths: [],
                };
              },
            }),
          );
          assert.deepEqual(launched, []);
        }),
        { numRuns: ZERO_LAUNCH_PROPERTY_RUNS },
      );
    });
  }

  void it("accepts supported spread-form runs.run calls", () => {
    fc.assert(
      fc.property(workflowKeyArbitrary, workflowTaskArbitrary, (key, task) => {
        const script = `const args=[${JSON.stringify(key)},{agent:"worker",task:${JSON.stringify(task)}}]; return await runs.run(...args);`;
        assert.deepEqual(validateWorkflowScript(script), { ok: true, errors: [] });
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  void it("accepts nested bindings that shadow a runs.all result", () => {
    fc.assert(
      fc.property(propertyNameWorkflowKeyArbitrary, workflowTaskArbitrary, (key, task) => {
        const script = `const children=await runs.all([{key:${JSON.stringify(key)},agent:"worker",task:${JSON.stringify(task)}}]); { const {children}= {children:{${key}:"inner"}}; children.${key}; } return children[0];`;
        assert.deepEqual(validateWorkflowScript(script), { ok: true, errors: [] });
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  void it("rejects key-style access to ordered runs.all results", () => {
    fc.assert(
      fc.property(propertyNameWorkflowKeyArbitrary, workflowTaskArbitrary, (key, task) => {
        const script = `const children=await runs.all([{key:${JSON.stringify(key)},agent:"worker",task:${JSON.stringify(task)}}]); return children.${key};`;
        const validation = validateWorkflowScript(script);
        assert.equal(validation.ok, false);
        assert.ok(
          validation.errors.some(({ message }) =>
            message.includes("runs.all returns an ordered array"),
          ),
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
