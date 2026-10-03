#!/usr/bin/env -S node --test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIVER = path.join(SKILL, "scripts/verify-pi-subagents.mjs");

function withFixture(runTest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verification-skill-test-"));
  const host = path.join(root, "host");
  fs.mkdirSync(host);
  fs.writeFileSync(
    path.join(host, "package.json"),
    JSON.stringify({
      name: "@earendil-works/pi-coding-agent",
      version: "1.0.0",
      bin: { pi: "cli.js" },
    }),
  );
  fs.writeFileSync(
    path.join(host, "cli.js"),
    'throw new Error("Doctor must not execute the host CLI");\n',
  );
  try {
    runTest({ root, host });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function invoke(command, host, evidence) {
  return spawnSync(process.execPath, [DRIVER, command, "--pi-sdk", host, "--evidence", evidence], {
    encoding: "utf8",
    timeout: 10_000,
  });
}

function cleanupFixture(root, evidence) {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "pi-subagents-verify-"));
  const token = randomUUID();
  const run = { version: 1, scratch, evidence, token, pids: [] };
  fs.mkdirSync(evidence);
  fs.writeFileSync(path.join(scratch, "owner.json"), JSON.stringify({ token, evidence }));
  fs.writeFileSync(path.join(scratch, "session.jsonl"), "PERSISTED EVIDENCE\n");
  fs.writeFileSync(path.join(evidence, "run.json"), JSON.stringify(run));
  return run;
}

await test("doctor is read-only and rejects uncertain host and path inputs through the CLI seam", () => {
  withFixture(({ root, host }) => {
    const evidence = path.join(root, "fresh");
    const before = fs.readdirSync(root);
    assert.equal(invoke("doctor", host, evidence).status, 0);
    assert.deepEqual(fs.readdirSync(root), before);
    assert.ok(!fs.existsSync(evidence));
    assert.notEqual(invoke("doctor", "relative", evidence).status, 0);
    fs.mkdirSync(evidence);
    assert.notEqual(invoke("doctor", host, evidence).status, 0);
    fs.writeFileSync(
      path.join(host, "package.json"),
      JSON.stringify({
        name: "@earendil-works/pi-coding-agent",
        version: "0.86.1",
        bin: { pi: "cli.js" },
      }),
    );
    assert.notEqual(invoke("doctor", host, path.join(root, "other")).status, 0);
    assert.deepEqual(fs.readdirSync(root).sort(), ["fresh", "host"]);
  });
});

await test("cleanup retains proof, removes only marked scratch, and is idempotent", () => {
  withFixture(({ root, host }) => {
    const evidence = path.join(root, "evidence");
    const run = cleanupFixture(root, evidence);
    try {
      assert.equal(invoke("cleanup", host, evidence).status, 0);
      assert.ok(!fs.existsSync(run.scratch));
      assert.equal(
        fs.readFileSync(path.join(evidence, "persistent/session.jsonl"), "utf8"),
        "PERSISTED EVIDENCE\n",
      );
      assert.equal(invoke("cleanup", host, evidence).status, 0);
      assert.ok(JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8")).ok);
      assert.ok(fs.existsSync(path.join(evidence, "persistent/session.jsonl")));
    } finally {
      fs.rmSync(run.scratch, { recursive: true, force: true });
    }
  });
});

await test("cleanup refuses a mismatched marker and scratch symlinks without deleting their targets", () => {
  withFixture(({ root, host }) => {
    const evidence = path.join(root, "evidence");
    const run = cleanupFixture(root, evidence);
    try {
      fs.writeFileSync(
        path.join(run.scratch, "owner.json"),
        JSON.stringify({ token: randomUUID(), evidence }),
      );
      assert.notEqual(invoke("cleanup", host, evidence).status, 0);
      assert.ok(fs.existsSync(run.scratch));
      fs.writeFileSync(
        path.join(run.scratch, "owner.json"),
        JSON.stringify({ token: run.token, evidence }),
      );
      const target = path.join(root, "outside");
      fs.writeFileSync(target, "KEEP");
      fs.symlinkSync(target, path.join(run.scratch, "link"));
      assert.notEqual(invoke("cleanup", host, evidence).status, 0);
      assert.equal(fs.readFileSync(target, "utf8"), "KEEP");
      assert.ok(fs.existsSync(run.scratch));
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8")).ok,
        false,
      );
    } finally {
      fs.rmSync(run.scratch, { recursive: true, force: true });
    }
  });
});

await test("cleanup refuses an unrelated real subprocess even with its correct birth identity", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const closed = new Promise((resolve) => {
    child.once("close", resolve);
  });
  try {
    await new Promise((resolve) => {
      child.once("spawn", resolve);
    });
    const stat = fs.readFileSync(`/proc/${child.pid}/stat`, "utf8");
    const birth = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    withFixture(({ root, host }) => {
      const evidence = path.join(root, "evidence");
      const run = cleanupFixture(root, evidence);
      try {
        run.pids.push({ pid: child.pid, birth });
        fs.writeFileSync(path.join(evidence, "run.json"), JSON.stringify(run));
        assert.notEqual(invoke("cleanup", host, evidence).status, 0);
        process.kill(child.pid, 0);
        assert.ok(fs.existsSync(run.scratch));
        assert.deepEqual(
          JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8")).signaled,
          [],
        );
      } finally {
        fs.rmSync(run.scratch, { recursive: true, force: true });
      }
    });
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
});

await test("cleanup checks birth identity before signaling an exact token-owned subprocess", async () => {
  const token = randomUUID();
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    env: { PI_SUBAGENTS_VERIFY_TOKEN: token },
  });
  const closed = new Promise((resolve) => {
    child.once("close", resolve);
  });
  try {
    await new Promise((resolve) => {
      child.once("spawn", resolve);
    });
    const stat = fs.readFileSync(`/proc/${child.pid}/stat`, "utf8");
    const birth = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    withFixture(({ root, host }) => {
      const evidence = path.join(root, "owned-process");
      const run = cleanupFixture(root, evidence);
      try {
        run.token = token;
        run.pids.push({ pid: child.pid, birth: "0" });
        fs.writeFileSync(path.join(run.scratch, "owner.json"), JSON.stringify({ token, evidence }));
        fs.writeFileSync(path.join(evidence, "run.json"), JSON.stringify(run));
        assert.notEqual(invoke("cleanup", host, evidence).status, 0);
        process.kill(child.pid, 0);
        assert.deepEqual(
          JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8")).signaled,
          [],
        );
        run.pids[0].birth = birth;
        fs.writeFileSync(path.join(evidence, "run.json"), JSON.stringify(run));
        assert.equal(invoke("cleanup", host, evidence).status, 0);
        const report = JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8"));
        assert.deepEqual(report.signaled, [{ pid: child.pid, signal: "SIGTERM" }]);
        assert.ok(!fs.existsSync(run.scratch));
      } finally {
        fs.rmSync(run.scratch, { recursive: true, force: true });
      }
    });
    await closed;
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
});

await test("failed drive preserves CLI diagnostics and persistent evidence after automatic cleanup", () => {
  withFixture(({ root, host }) => {
    const evidence = path.join(root, "failed-drive");
    assert.notEqual(invoke("drive", host, evidence).status, 0);
    const run = JSON.parse(fs.readFileSync(path.join(evidence, "run.json"), "utf8"));
    assert.ok(!fs.existsSync(run.scratch));
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, "result.json"), "utf8")).ok, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, "cleanup.json"), "utf8")).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, "cli.exit.json"), "utf8")).code, 1);
    assert.match(
      fs.readFileSync(path.join(evidence, "cli.stderr.txt"), "utf8"),
      /Doctor must not execute/,
    );
    assert.ok(fs.existsSync(path.join(evidence, "failure.json")));
    assert.ok(fs.existsSync(path.join(evidence, "persistent/owner.json")));
  });
});

await test("project skill frontmatter, feature sections, relative links, and executable driver are discoverable", () => {
  const skillText = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  assert.match(skillText, /^---\nname: verify-pi-subagents\ndescription: [^\n]+\n---/);
  assert.ok(!skillText.includes("disable-model-invocation: true"));
  for (const heading of ["Launch", "Doctor", "Drive", "Evidence", "Cleanup", "Helpers"]) {
    assert.ok(skillText.includes(`## ${heading}\n`));
  }
  assert.ok(fs.statSync(DRIVER).mode & 0o111);
  assert.match(fs.readFileSync(DRIVER, "utf8"), /^#!\/usr\/bin\/env node\n/);
  assert.ok(fs.statSync(fileURLToPath(import.meta.url)).mode & 0o111);
  const featureDir = path.join(SKILL, "features");
  const features = fs.readdirSync(featureDir).filter((name) => name !== "README.md");
  assert.ok(features.length >= 3 && features.length <= 5);
  const index = fs.readFileSync(path.join(featureDir, "README.md"), "utf8");
  for (const feature of features) {
    assert.ok(index.includes(`](${feature})`));
    const text = fs.readFileSync(path.join(featureDir, feature), "utf8");
    assert.deepEqual(
      [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
      [
        "Sub-features",
        "How to get to it (user POV)",
        "Driving it with verify-pi-subagents",
        "Gotchas",
      ],
    );
    assert.match(text, /Preconditions:/);
  }
  for (const file of fs.globSync("**/*.md", { cwd: SKILL }).map((name) => path.join(SKILL, name))) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(file), target)),
        `Missing link ${target} in ${file}`,
      );
    }
  }
});
