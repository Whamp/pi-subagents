#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const SKILL = path.resolve(path.dirname(SCRIPT), "..");
const SOURCE = path.resolve(SKILL, "../../..");
const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag:
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW,
  });
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function absolutePath(value) {
  assert.ok(value && path.isAbsolute(value), "Verification requires absolute paths");
  assert.equal(path.normalize(value), value, "Verification requires normalized paths");
  return value;
}

function canonicalDirectory(value) {
  absolutePath(value);
  assert.equal(fs.realpathSync(value), value, "Verification refuses symlink directories");
  assert.ok(fs.statSync(value).isDirectory());
  return value;
}

function hostDoctor(piSdk, evidence, command) {
  assert.equal(process.platform, "linux", "Verification cleanup requires Linux /proc");
  assert.ok(Number(process.versions.node.split(".")[0]) >= 24, "Verification requires Node >=24");
  canonicalDirectory(piSdk);
  absolutePath(evidence);
  canonicalDirectory(path.dirname(evidence));
  const pkg = readJson(path.join(piSdk, "package.json"));
  assert.equal(pkg.name, "@earendil-works/pi-coding-agent");
  assert.match(pkg.version, /^1\.0\.\d+$/, "Verification requires the npm Pi 1.0.x CLI");
  assert.match(pkg.bin?.pi, /^[^\0]+\.js$/, "Verification requires the actual npm pi bin");
  const cli = fs.realpathSync(path.resolve(piSdk, pkg.bin.pi));
  assert.ok(cli.startsWith(piSdk + path.sep), "Verification CLI escapes host package");
  assert.ok(fs.statSync(cli).isFile());
  assert.ok(
    fs.existsSync(path.join(SOURCE, "node_modules/jiti/package.json")),
    "Run npm ci in the source checkout first",
  );
  assert.ok(fs.existsSync(path.join(SOURCE, "index.ts")));
  fs.accessSync("/proc/self/environ", fs.constants.R_OK);
  if (command === "cleanup") {
    canonicalDirectory(evidence);
  } else {
    assert.ok(!fs.existsSync(evidence), "Verification requires a fresh evidence directory");
  }
  return {
    packageRoot: piSdk,
    name: pkg.name,
    version: pkg.version,
    cli,
    node: process.execPath,
    nodeVersion: process.version,
  };
}

function processIdentity(pid, token) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z") {
      return null;
    }
    const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    assert.ok(
      env.includes(`PI_SUBAGENTS_VERIFY_TOKEN=${token}`),
      `Verification PID ${pid} token mismatch`,
    );
    return { pid, birth: fields[19] };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") {
      return null;
    }
    throw error;
  }
}

function findOwnedProcesses(token) {
  const owned = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    let env;
    try {
      env = fs.readFileSync(`/proc/${entry}/environ`, "utf8").split("\0");
    } catch (error) {
      if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(error.code)) {
        continue;
      }
      throw error;
    }
    if (env.includes(`PI_SUBAGENTS_VERIFY_TOKEN=${token}`)) {
      const identity = processIdentity(Number(entry), token);
      if (identity) {
        owned.push(identity);
      }
    }
  }
  return owned;
}

function rememberProcesses(run, evidence) {
  for (const identity of findOwnedProcesses(run.token)) {
    if (!run.pids.some((prior) => prior.pid === identity.pid && prior.birth === identity.birth)) {
      run.pids.push(identity);
    }
  }
  writeJson(path.join(evidence, "run.json"), run);
}

function validateScratch(run, evidence) {
  assert.match(run.token, /^[a-f0-9-]{36}$/);
  assert.equal(run.version, 1);
  assert.equal(run.evidence, evidence);
  absolutePath(run.scratch);
  assert.equal(path.dirname(run.scratch), fs.realpathSync(os.tmpdir()));
  assert.match(path.basename(run.scratch), /^pi-subagents-verify-[A-Za-z0-9]+$/);
  assert.ok(!evidence.startsWith(run.scratch + path.sep));
  assert.ok(
    Array.isArray(run.pids) && run.pids.length <= 8,
    "Verification refuses oversized PID ledger",
  );
  for (const identity of run.pids) {
    assert.ok(Number.isInteger(identity.pid) && identity.pid > 1 && identity.pid !== process.pid);
    assert.match(identity.birth, /^\d+$/);
  }
  if (fs.existsSync(run.scratch)) {
    canonicalDirectory(run.scratch);
    assert.equal(fs.statSync(run.scratch).uid, process.getuid());
    const marker = readJson(path.join(run.scratch, "owner.json"));
    assert.deepEqual(marker, { token: run.token, evidence });
  }
}

function validateTree(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Verification refuses scratch symlink: ${file}`);
    if (entry.isDirectory()) {
      validateTree(file);
    } else {
      assert.ok(entry.isFile(), `Verification refuses special scratch file: ${file}`);
    }
  }
}

function copyPersistentEvidence(run, evidence) {
  if (!fs.existsSync(run.scratch)) {
    return;
  }
  validateTree(run.scratch);
  const snapshot = path.join(evidence, "persistent");
  fs.mkdirSync(snapshot, { recursive: true, mode: 0o700 });
  canonicalDirectory(snapshot);
  validateTree(snapshot);
  fs.cpSync(run.scratch, snapshot, { recursive: true, force: true });
}

async function cleanupOwnedRun(evidence) {
  const report = { ok: false, signaled: [], gone: [], remnants: [], errors: [] };
  let run;
  try {
    assert.ok(
      !fs.lstatSync(path.join(evidence, "run.json")).isSymbolicLink(),
      "Verification refuses symlink run ledger",
    );
    run = readJson(path.join(evidence, "run.json"));
    validateScratch(run, evidence);
    if (fs.existsSync(run.scratch)) {
      validateTree(run.scratch);
    }
    for (const live of findOwnedProcesses(run.token)) {
      assert.ok(
        run.pids.some((identity) => identity.pid === live.pid && identity.birth === live.birth),
        `Verification refuses unrecorded PID ${live.pid}`,
      );
    }
    for (const identity of run.pids) {
      const live = processIdentity(identity.pid, run.token);
      if (!live) {
        report.gone.push(identity.pid);
        continue;
      }
      assert.equal(live.birth, identity.birth, `Verification PID ${identity.pid} birth mismatch`);
      for (const signal of ["SIGTERM", "SIGKILL"]) {
        const current = processIdentity(identity.pid, run.token);
        if (!current) {
          break;
        }
        assert.equal(current.birth, identity.birth);
        process.kill(identity.pid, signal);
        report.signaled.push({ pid: identity.pid, signal });
        const deadline = Date.now() + 2_000;
        while (Date.now() < deadline && processIdentity(identity.pid, run.token)) {
          await sleep(50);
        }
      }
      assert.equal(
        processIdentity(identity.pid, run.token),
        null,
        `Verification PID ${identity.pid} remains alive`,
      );
      report.gone.push(identity.pid);
    }
    assert.deepEqual(findOwnedProcesses(run.token), [], "Verification owned processes remain");
    if (fs.existsSync(run.scratch)) {
      copyPersistentEvidence(run, evidence);
      validateScratch(run, evidence);
      validateTree(run.scratch);
      fs.rmSync(run.scratch, { recursive: true });
    }
    report.ok = true;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    if (run?.scratch) {
      report.remnants.push(run.scratch);
      for (const identity of run.pids ?? []) {
        if (!report.gone.includes(identity.pid)) {
          report.remnants.push(`PID ${identity.pid} (unverified)`);
        }
      }
    }
  }
  writeJson(path.join(evidence, "cleanup.json"), report);
  return report;
}

function gitOutput(...args) {
  const result = spawnSync("git", ["-C", SOURCE, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function assertRealProof(evidence, run) {
  const records = fs
    .readFileSync(path.join(evidence, "observer.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const calls = records.filter((record) => record.kind === "tool_call");
  const results = records.filter((record) => record.kind === "tool_result");
  assert.deepEqual(
    calls.map((call) => ({ tool: call.toolName, action: call.input.action ?? null })),
    [
      { tool: "subagents_enable", action: null },
      { tool: "subagent", action: "help" },
      { tool: "subagent", action: "execute" },
      { tool: "bg_wait", action: null },
      { tool: "subagent", action: "status" },
    ],
    "Verification requires every mapped model-issued action in order",
  );
  for (const call of calls) {
    assert.ok(
      !call.parentToolCallId,
      "Verification expects model-issued calls, not nested dispatch",
    );
    const result = results.find((record) => record.toolCallId === call.toolCallId);
    assert.ok(
      result && !result.isError,
      `Verification missing successful result: ${call.toolCallId}`,
    );
  }
  const launch = results.find(
    (record) => record.toolName === "subagent" && record.input.action === "execute",
  );
  assert.ok(launch?.details.asyncId && launch.details.asyncDir);
  assert.ok(launch.details.asyncDir.startsWith(run.scratch + path.sep));
  const proof = readJson(path.join(launch.details.asyncDir, "process-terminal.json"));
  const status = readJson(path.join(launch.details.asyncDir, "status.json"));
  assert.equal(status.state, "complete");
  assert.equal(proof.state, "observed");
  assert.equal(proof.runId, launch.details.asyncId);
  const runner = proof.instances.find((instance) => instance.kind === "runner");
  assert.ok(runner);
  assert.equal(runner.exitCode, 0);
  assert.equal(runner.signal, null);
  const parent = records.find(
    (record) => record.kind === "provider_request" && record.model === "parent",
  );
  const child = records.find(
    (record) => record.kind === "provider_request" && record.model === "child",
  );
  assert.ok(parent && child && parent.pid !== child.pid);
  assert.equal(status.pid, child.pid);
  assert.equal(runner.processInstanceId, proof.runnerProcessInstanceId);
  assert.equal(
    fs
      .readFileSync(path.join(launch.details.asyncDir, "output-0.log"), "utf8")
      .trim()
      .split("\n")
      .at(-1),
    "PI_SUBAGENTS_VERIFIED_CHILD",
  );
  assert.ok(
    results.some(
      (record) => record.input.action === "help" && JSON.stringify(record).includes("agent"),
    ),
  );
  assert.ok(
    results.some(
      (record) =>
        record.input.action === "status" &&
        JSON.stringify(record).includes("PI_SUBAGENTS_VERIFIED_CHILD"),
    ),
  );
  const stdout = fs.readFileSync(path.join(evidence, "cli.stdout.jsonl"), "utf8");
  assert.ok(stdout.includes("PI_SUBAGENTS_VERIFICATION_PARENT_DONE"));
  const sessionFiles = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(file);
      } else if (entry.name.endsWith(".jsonl")) {
        const entries = fs
          .readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        if (
          entries.some(
            (item) =>
              item.type === "message" &&
              item.message?.role === "assistant" &&
              item.message.model === "child" &&
              item.message.content.some(
                (block) => block.type === "text" && block.text === "PI_SUBAGENTS_VERIFIED_CHILD",
              ),
          )
        ) {
          sessionFiles.push(file);
        }
      }
    }
  }
  visit(path.join(run.scratch, "sessions"));
  assert.ok(sessionFiles.length > 0, "Verification requires persisted child session output");
  return {
    feature: "compact-catalog-background",
    parentPid: parent.pid,
    childPid: child.pid,
    asyncId: launch.details.asyncId,
    status,
    terminal: proof,
    sessionFiles,
    calls: calls.map((call) => ({ tool: call.toolName, input: call.input })),
    schemaCharacters: records
      .filter((record) => record.kind === "provider_request")
      .map((record) => ({ model: record.model, step: record.step, characters: record.characters })),
  };
}

async function driveRealCli(host, evidence) {
  fs.mkdirSync(evidence, { mode: 0o700 });
  const run = {
    version: 1,
    token: randomUUID(),
    evidence,
    scratch: fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "pi-subagents-verify-")),
    pids: [],
  };
  writeJson(path.join(evidence, "run.json"), run);
  writeJson(path.join(run.scratch, "owner.json"), { token: run.token, evidence });
  let failure;
  let cliClosed;
  let interrupted = false;
  const requestStop = () => {
    interrupted = true;
  };
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
  try {
    for (const dir of ["home", "agent", "cwd", "cache", "sessions", "runtime", "tmp"]) {
      fs.mkdirSync(path.join(run.scratch, dir));
    }
    const agentDir = path.join(run.scratch, "agent");
    fs.mkdirSync(path.join(agentDir, "agents"));
    const observer = path.join(SKILL, "scripts/verification-observer.ts");
    fs.writeFileSync(
      path.join(agentDir, "agents/verification-child.md"),
      `---\nname: verification-child\ndescription: Verification-only deterministic child\ntools:\nextensions: ${observer}\ninheritSkills: false\ninheritProjectContext: false\ninheritGlobalContext: false\nsystemPromptMode: replace\n---\nReturn the requested marker.\n`,
    );
    fs.mkdirSync(path.join(agentDir, "extensions/subagent"), { recursive: true });
    writeJson(path.join(agentDir, "extensions/subagent/config.json"), {
      watchdog: { enabled: false },
      orcaProgressTabs: { enabled: false },
      artifactDir: "temp",
    });
    const projectSkills = path.join(run.scratch, "cwd/.pi/skills");
    fs.mkdirSync(projectSkills, { recursive: true });
    fs.cpSync(SKILL, path.join(projectSkills, "verify-pi-subagents"), { recursive: true });
    const argv = [
      host.cli,
      "--offline",
      "--approve",
      "--no-extensions",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-builtin-tools",
      "--extension",
      path.join(SOURCE, "index.ts"),
      "--extension",
      observer,
      "--model",
      "subagents-verification/parent",
      "--session-dir",
      path.join(run.scratch, "sessions"),
      "--mode",
      "json",
      "Delegation is authorized. Activate subagents, discover execute, launch one verification-child in the background, then wait and inspect its result.",
    ];
    const env = {
      PATH: path.dirname(process.execPath) + ":/usr/bin:/bin",
      HOME: path.join(run.scratch, "home"),
      PI_CODING_AGENT_DIR: agentDir,
      XDG_CACHE_HOME: path.join(run.scratch, "cache"),
      TMPDIR: path.join(run.scratch, "tmp"),
      PI_SUBAGENTS_TEMP_ROOT: path.join(run.scratch, "runtime"),
      PI_CODING_AGENT_SESSION_DIR: path.join(run.scratch, "sessions"),
      PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT: host.packageRoot,
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      PI_SUBAGENTS_VERIFY_TOKEN: run.token,
      PI_SUBAGENTS_VERIFY_EVIDENCE: evidence,
      PI_SUBAGENTS_VERIFY_SCRATCH: run.scratch,
    };
    writeJson(path.join(evidence, "manifest.json"), {
      run,
      host,
      source: SOURCE,
      gitHead: gitOutput("rev-parse", "HEAD"),
      gitTree: gitOutput("rev-parse", "HEAD^{tree}"),
      gitDirty: gitOutput("status", "--porcelain=v1", "--untracked-files=all"),
      gitDiffSha256: createHash("sha256")
        .update(gitOutput("diff", "--binary", "HEAD"))
        .digest("hex"),
      hashes: Object.fromEntries(
        [
          SCRIPT,
          observer,
          path.join(SOURCE, "index.ts"),
          path.join(SOURCE, "package-lock.json"),
          path.join(SKILL, "SKILL.md"),
        ].map((file) => [file, sha256(file)]),
      ),
      cli: { command: process.execPath, argv, cwd: path.join(run.scratch, "cwd"), env },
    });
    const out = fs.openSync(path.join(evidence, "cli.stdout.jsonl"), "w", 0o600);
    const err = fs.openSync(path.join(evidence, "cli.stderr.txt"), "w", 0o600);
    let proc;
    try {
      proc = spawn(process.execPath, argv, {
        cwd: path.join(run.scratch, "cwd"),
        env,
        stdio: ["ignore", out, err],
      });
    } finally {
      fs.closeSync(out);
      fs.closeSync(err);
    }
    let exited = false;
    let spawnError;
    const closed = new Promise((resolve) => {
      proc.once("error", (error) => {
        spawnError = error.message;
      });
      proc.once("close", (code, signal) => {
        exited = true;
        resolve({ code, signal, spawnError });
      });
    });
    cliClosed = closed;
    const deadline = Date.now() + 60_000;
    while (!exited && !interrupted && Date.now() < deadline) {
      rememberProcesses(run, evidence);
      await sleep(50);
    }
    rememberProcesses(run, evidence);
    assert.ok(!interrupted, "Verification interrupted; cleanup requested");
    assert.ok(exited, "Verification CLI exceeded 60 seconds");
    const exit = await closed;
    writeJson(path.join(evidence, "cli.exit.json"), exit);
    assert.equal(exit.code, 0, "Verification CLI failed; inspect cli.stderr.txt");
    const proofDeadline = Date.now() + 5_000;
    let proof;
    while (Date.now() < proofDeadline) {
      try {
        proof = assertRealProof(evidence, run);
        break;
      } catch (error) {
        failure = error;
        await sleep(100);
      }
    }
    assert.ok(proof, failure?.message);
    failure = undefined;
    writeJson(path.join(evidence, "proof.json"), proof);
    const { loadSkills } = await import(path.join(host.packageRoot, "dist/index.js"));
    const loaded = loadSkills({
      cwd: path.join(run.scratch, "cwd"),
      agentDir,
      skillPaths: [],
      includeDefaults: true,
    });
    const sourceLoaded = loadSkills({
      cwd: SOURCE,
      agentDir,
      skillPaths: [],
      includeDefaults: true,
    });
    for (const result of [loaded, sourceLoaded]) {
      assert.ok(
        result.skills.some(
          (skill) =>
            skill.name === "verify-pi-subagents" &&
            skill.description &&
            !skill.disableModelInvocation,
        ),
      );
    }
    writeJson(path.join(evidence, "skills.json"), { isolated: loaded, source: sourceLoaded });
  } catch (error) {
    failure = error;
    writeJson(path.join(evidence, "failure.json"), {
      message: error instanceof Error ? error.message : String(error),
      stack: error.stack,
    });
  } finally {
    rememberProcesses(run, evidence);
    const cleanup = await cleanupOwnedRun(evidence);
    if (cliClosed && cleanup.ok) {
      writeJson(path.join(evidence, "cli.exit.json"), await cliClosed);
    }
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
    writeJson(path.join(evidence, "result.json"), {
      ok: !failure && cleanup.ok,
      cleanupOk: cleanup.ok,
    });
    if (!cleanup.ok && !failure) {
      failure = new Error("Verification cleanup refused; inspect cleanup.json");
    }
  }
  if (failure) {
    throw failure;
  }
}

try {
  const [command, ...args] = process.argv.slice(2);
  assert.ok(
    ["doctor", "drive", "cleanup"].includes(command),
    "Usage: verify-pi-subagents.mjs doctor|drive|cleanup --pi-sdk /absolute/package/root --evidence /absolute/fresh/directory",
  );
  assert.equal(args.length, 4, "Verification requires exactly --pi-sdk and --evidence");
  const flags = new Map([
    [args[0], args[1]],
    [args[2], args[3]],
  ]);
  assert.ok(flags.size === 2 && flags.has("--pi-sdk") && flags.has("--evidence"));
  const evidence = absolutePath(flags.get("--evidence"));
  const host = hostDoctor(absolutePath(flags.get("--pi-sdk")), evidence, command);
  if (command === "drive") {
    await driveRealCli(host, evidence);
  } else if (command === "cleanup") {
    assert.ok(
      (await cleanupOwnedRun(evidence)).ok,
      "Verification cleanup refused; inspect cleanup.json",
    );
  }
  process.stdout.write(JSON.stringify({ ok: true, command, host, evidence }) + "\n");
} catch (error) {
  process.stderr.write((error instanceof Error ? error.stack : String(error)) + "\n");
  process.exitCode = 1;
}
