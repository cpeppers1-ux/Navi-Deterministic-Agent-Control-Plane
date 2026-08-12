import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { navigationContract } from "../src/core/navigate.js";
import { buildContext, contextJson, contextReport } from "../src/core/context.js";
import { repositoryObservationJson, repositoryObservationReport } from "../src/adapters/repository.js";
import { RepositoryIndexService } from "../src/adapters/repository-index.js";
import { FileContextProvider, IndexSymbolProvider } from "../src/adapters/providers.js";
import { initialState, initializeState, readState, statePath } from "../src/core/state.js";
import { createTransition, formatTransition, listTransitions, loadTransition, saveTransition, transitionJson, transitionReport, validateTransition } from "../src/core/transition.js";
import { ClaudeCodeAdapter, CodexCliAdapter, GeminiCliAdapter, getAgentAdapter } from "../src/adapters/agent-runner.js";
import { runNaviStart, startJson, startReport } from "../src/core/start.js";
import { executionJson, executionReport, runNaviExecute } from "../src/core/execution.js";
import { checkpointDiffReport, checkpointJson, checkpointReport, compareCheckpoints, createCheckpoint, listCheckpoints, loadCheckpoint, loadLatestCheckpoint, saveCheckpoint } from "../src/core/checkpoint.js";
import { findDoNotTouchViolations, findScopeViolations, validateState, validationReport } from "../src/core/validate.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "navi-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("creates initial Navi state", async () => withTempDir(async (dir) => {
  const result = await initializeState(dir);
  assert.equal(result.created, true);
  assert.deepEqual(JSON.parse(await readFile(statePath(dir), "utf8")), initialState());
}));

test("refuses to overwrite existing state by default", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  await writeFile(statePath(dir), '{"destination":"preserve me"}\n');
  const result = await initializeState(dir);
  assert.equal(result.created, false);
  assert.equal(await readFile(statePath(dir), "utf8"), '{"destination":"preserve me"}\n');
}));

test("reads state", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  const state = await readState(dir);
  assert.deepEqual(state, initialState());
}));

test("reads optional last verified state", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  const state = initialState();
  state.lastVerified = {
    commit: "4f8d3ab",
    typeScript: "PASS",
    tests: "PASS",
    timestamp: "2026-08-01T12:00:00.000Z"
  };
  await writeFile(statePath(dir), `${JSON.stringify(state)}\n`);

  assert.deepEqual((await readState(dir))?.lastVerified, state.lastVerified);
}));

test("rejects malformed state before generating a contract", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  await writeFile(statePath(dir), '{"version":"0.1.0"}\n');
  await assert.rejects(readState(dir), /expected schema/);
}));

test("generates a navigation contract", () => {
  const state = initialState();
  state.destination = "Ship Phase 1";
  state.currentTurn.scope = ["src/"];
  assert.match(navigationContract(state), /NAVI \/\/ TURN 1/);
  assert.match(navigationContract(state), /Ship Phase 1/);
  assert.match(navigationContract(state), /- src\//);
  assert.match(navigationContract(state), /EXECUTE\./);
});

test("handles missing state gracefully", async () => withTempDir(async (dir) => {
  assert.equal(await readState(dir), null);
}));

test("detects scope and protected-path violations from observed Git changes", async () => {
  const state = initialState();
  state.currentTurn.scope = ["src/"];
  state.currentTurn.doNotTouch = ["src/core/state.ts"];
  const changed = ["src/cli.ts", "src/core/state.ts", "README.md"];

  assert.deepEqual(findScopeViolations(changed, state.currentTurn.scope), ["README.md"]);
  assert.deepEqual(findDoNotTouchViolations(changed, state.currentTurn.doNotTouch), ["src/core/state.ts"]);
});

test("validates Git observations and verification commands", async () => {
  const state = initialState();
  state.currentTurn.scope = ["src/"];
  state.currentTurn.verify = ["npm test", "npm run lint"];
  const result = await validateState("/project", state, {
    observeGitDiff: async () => ({ changedFiles: ["src/cli.ts"] }),
    runVerification: async (command) => ({ command, passed: command === "npm test" })
  });

  assert.equal(result.passed, false);
  assert.match(validationReport(result), /PASS: npm test/);
  assert.match(validationReport(result), /FAIL: npm run lint/);
  assert.match(validationReport(result), /RESULT: FAIL/);
});

test("formats a lightweight repository observation", () => {
  const report = repositoryObservationReport({
    projectDir: "/project",
    files: ["src/cli.ts", "src/core/state.ts"],
    branch: "main",
    head: "4f8d3ab",
    modifiedFiles: ["src/cli.ts", "tests/core.test.ts"],
    untrackedFiles: [],
    deletedFiles: []
  }, {
    state: "AUTHORIZED",
    scopeViolations: [],
    protectedPathViolations: [],
    verifications: [
      { name: "TypeScript", passed: true },
      { name: "Tests", passed: true }
    ],
    lastVerified: {
      commit: "4f8d3ab",
      typeScript: "PASS",
      tests: "PASS",
      timestamp: "2026-08-01T12:00:00.000Z"
    }
  });

  assert.equal(report, [
    "NAVI OBSERVE",
    "",
    "CURRENT REPOSITORY",
    "──────────────────",
    "Branch: main",
    "HEAD: 4f8d3ab",
    "",
    "Working Tree",
    "Modified: 2",
    "Untracked: 0",
    "Deleted: 0",
    "",
    "CURRENT VERIFICATION",
    "────────────────────",
    "TypeScript: PASS",
    "Tests: PASS",
    "",
    "LAST VERIFIED CHECKPOINT",
    "────────────────────────",
    "Commit: 4f8d3ab",
    "TypeScript: PASS",
    "Tests: PASS",
    "Timestamp: 2026-08-01T12:00:00.000Z",
    "",
    "TRANSITION STATUS",
    "─────────────────",
    "State: AUTHORIZED",
    "",
    "Scope Violations:",
    "None",
    "",
    "Protected Paths:",
    "None",
    "",
    "Verification Required: YES",
    "Ready for Validation: YES"
  ].join("\n"));
});

test("serializes the repository observation for machines", () => {
  const output = repositoryObservationJson({
    projectDir: "/project",
    files: [],
    branch: "main",
    head: "4f8d3ab",
    modifiedFiles: [],
    untrackedFiles: [],
    deletedFiles: []
  }, {
    state: "AUTHORIZED",
    scopeViolations: [],
    protectedPathViolations: ["src/core/state.ts"],
    verifications: [{ name: "TypeScript", passed: true }, { name: "Tests", passed: true }],
    lastVerified: null
  });

  const snapshot = JSON.parse(output) as { transition: { verificationRequired: boolean; protectedPathViolations: string[] } };
  assert.equal(snapshot.transition.verificationRequired, true);
  assert.deepEqual(snapshot.transition.protectedPathViolations, ["src/core/state.ts"]);
});

test("builds a bounded context from scoped files and their direct neighborhood", () => {
  const state = initialState();
  state.currentTurn.task = "Update the router";
  state.currentTurn.scope = ["src/engine/router.ts"];
  state.currentTurn.verify = ["npm test"];
  const context = buildContext({
    projectDir: "/project",
    records: [
      { path: "src/cli.ts", imports: ["./engine/router"], importedBy: [], exports: [], subsystem: "cli" },
      { path: "src/engine/router.ts", imports: ["./state", "./verify"], importedBy: ["src/cli.ts"], exports: ["Router"], subsystem: "engine" },
      { path: "src/engine/state.ts", imports: [], importedBy: ["src/engine/router.ts"], exports: ["State"], subsystem: "engine" },
      { path: "src/engine/verify.ts", imports: [], importedBy: ["src/engine/router.ts"], exports: ["verify"], subsystem: "engine" },
      { path: "tests/router.test.ts", imports: [], importedBy: [], exports: [], subsystem: "tests" }
    ]
  }, state);

  assert.deepEqual(context.primaryFiles, ["src/engine/router.ts"]);
  assert.deepEqual(context.dependencyNeighborhood, ["src/cli.ts", "src/engine/state.ts", "src/engine/verify.ts"]);
  assert.deepEqual(context.exports, [
    { path: "src/engine/router.ts", names: ["Router"] },
    { path: "src/engine/state.ts", names: ["State"] },
    { path: "src/engine/verify.ts", names: ["verify"] }
  ]);
  assert.equal(context.tokenSaver.selectedFiles, 4);
  assert.match(contextReport(context), /NAVI CONTEXT/);
  assert.deepEqual(JSON.parse(contextJson(context)).primaryFiles, ["src/engine/router.ts"]);
});

test("builds an in-memory repository index from source files", async () => withTempDir(async (dir) => {
  await mkdir(join(dir, "src", "core"), { recursive: true });
  await mkdir(join(dir, "node_modules", "ignored"), { recursive: true });
  await writeFile(join(dir, "src", "core", "feature.ts"), [
    'import { helper } from "./helper.js";',
    'import "node:path";',
    'const legacy = require("legacy-module");',
    "// import { ignored } from \"./ignored.js\";",
    "export const value = helper;",
    "export default function buildFeature() {}",
    "export { value as publicValue };",
    "/* export const ignored = true; */"
  ].join("\n"));
  await writeFile(join(dir, "src", "core", "helper.ts"), "export function helper() {}");
  await writeFile(join(dir, "node_modules", "ignored", "skip.ts"), "export const skipped = true;");
  await writeFile(join(dir, "src", "core", "feature.generated.ts"), "export const skipped = true;");
  await writeFile(join(dir, "README.md"), "not source");

  const index = await new RepositoryIndexService().parse(dir);

  assert.equal(index.records.length, 2);
  assert.deepEqual(index.records[0], {
    path: "src/core/feature.ts",
    imports: ["./helper.js", "node:path", "legacy-module"],
    importedBy: [],
    exports: ["value", "buildFeature", "publicValue", "default"],
    subsystem: "core"
  });
  assert.deepEqual(index.records[1].importedBy, ["src/core/feature.ts"]);
}));

test("lists symbols and reads context using IndexSymbolProvider and FileContextProvider", async () => withTempDir(async (dir) => {
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "index.ts"), [
    'export const alpha = 1;',
    'export function beta() {}',
    'export class Gamma {}'
  ].join("\n"));

  const index = await new RepositoryIndexService().parse(dir);
  const symbolProvider = new IndexSymbolProvider();
  const symbols = await symbolProvider.listSymbols(index);

  assert.deepEqual(symbols, [
    { name: "alpha", path: "src/index.ts", kind: "const" },
    { name: "beta", path: "src/index.ts", kind: "function" },
    { name: "Gamma", path: "src/index.ts", kind: "class" }
  ]);

  const contextProvider = new FileContextProvider();
  const contexts = await contextProvider.getContext(index, ["src/index.ts", "src/nonexistent.ts"]);
  assert.equal(contexts.length, 1);
  assert.match(contexts[0], /export const alpha = 1;/);
}));

test("creates, saves, loads, and lists transitions deterministically", async () => withTempDir(async (dir) => {
  const state = initialState();
  state.currentTurn.task = "Implement transition engine";
  state.currentTurn.scope = ["src/core/transition.ts"];
  state.currentTurn.verify = ["npm test"];

  const transition = createTransition(state, { status: "PROPOSED" });
  assert.equal(transition.id, 1);
  assert.equal(transition.task, "Implement transition engine");

  const path = await saveTransition(dir, transition);
  assert.match(path, /transition-1\.json/);

  const loaded = await loadTransition(dir, 1);
  assert.deepEqual(loaded, transition);

  const list = await listTransitions(dir);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], transition);
}));

test("validates transitions against git observations and verification commands", async () => {
  const state = initialState();
  state.currentTurn.scope = ["src/"];
  state.currentTurn.doNotTouch = ["src/core/state.ts"];
  state.currentTurn.verify = ["npm test"];
  const transition = createTransition(state, { status: "AUTHORIZED" });

  const result = await validateTransition("/project", transition, {
    observeGitDiff: async () => ({ changedFiles: ["src/core/transition.ts"] }),
    runVerification: async (command) => ({ command, passed: true })
  });

  assert.equal(result.passed, true);
  assert.match(transitionReport(result), /RESULT: PASS/);
  assert.match(formatTransition(transition), /NAVI TRANSITION \/\/ TURN 1/);
});

test("builds context from a NaviTransition instance", async () => withTempDir(async (dir) => {
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "app.ts"), 'export const app = "navi";');

  const index = await new RepositoryIndexService().parse(dir);
  const state = initialState();
  const transition = createTransition(state, {
    task: "Build transition context",
    scope: ["src/app.ts"],
    verify: ["npm test"]
  });

  const context = buildContext(index, transition);
  assert.equal(context.currentTask, "Build transition context");
  assert.deepEqual(context.primaryFiles, ["src/app.ts"]);
  assert.deepEqual(context.verificationCommands, ["npm test"]);
}));

test("orchestrates closed-loop workflow with runNaviStart", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "index.ts"), 'export const version = "0.1.0";');

  const result = await runNaviStart(dir);
  assert.equal(result.state.status, "AUTHORIZED");
  assert.equal(result.transition.id, 1);
  assert.equal(result.context.primaryFiles.length, 0);
  assert.match(result.contract, /NAVI \/\/ TURN 1/);
  assert.equal(typeof result.authorized, "boolean");

  const report = startReport(result);
  assert.match(report, /NAVI START \/\/ CLOSED-LOOP ORCHESTRATION/);
  assert.match(report, /1\. REPOSITORY OBSERVATION/);
  assert.match(report, /7\. AGENT ADAPTER DISPATCH/);
  assert.match(report, /Agent: gemini/);

  const json = JSON.parse(startJson(result));
  assert.equal(json.state.version, "0.1.0");
  assert.equal(json.agent.type, "gemini");
}));

test("formats agent execution requests deterministically for Gemini, Codex, and Claude adapters", async () => {
  const gemini = getAgentAdapter("gemini");
  const codex = getAgentAdapter("codex");
  const claude = getAgentAdapter("claude");

  assert.equal(gemini.agentType, "gemini");
  assert.equal(codex.agentType, "codex");
  assert.equal(claude.agentType, "claude");

  const dummyRequest = {
    contract: "NAVI // TURN 1\nTASK: Test",
    task: "Test task",
    context: {
      currentTask: "Test task",
      allowedScope: ["src/"],
      primaryFiles: ["src/index.ts"],
      dependencyNeighborhood: [],
      exports: [],
      verificationCommands: ["npm test"],
      estimatedContextTokens: 100,
      tokenSaver: { indexedFiles: 1, selectedFiles: 1, omittedFiles: 0, estimatedTokensSaved: 0 }
    },
    transition: {
      id: 1,
      task: "Test task",
      scope: ["src/"],
      acceptance: [],
      doNotTouch: [],
      verify: ["npm test"],
      status: "AUTHORIZED" as const,
      timestamp: "2026-08-05T00:00:00.000Z",
      positionBefore: "Start",
      positionAfter: "Finish"
    }
  };

  const geminiReq = gemini.formatRequest(dummyRequest);
  assert.deepEqual(geminiReq.commandLine.slice(0, 3), ["gemini", "--model", "gemini-2.5-pro"]);

  const codexReq = codex.formatRequest(dummyRequest);
  assert.deepEqual(codexReq.commandLine.slice(0, 4), ["codex", "exec", "--model", "codex-v1"]);

  const claudeReq = claude.formatRequest(dummyRequest);
  assert.deepEqual(claudeReq.commandLine.slice(0, 4), ["claude", "--print", "-m", "claude-3-5-sonnet"]);

  const geminiCaps = await gemini.detectCapabilities();
  assert.equal(geminiCaps.available, true);
  assert.equal(gemini.validateConfig({ agent: "gemini" }).valid, true);
});

test("executes bounded contract and post-observes repository with runNaviExecute", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "main.ts"), 'export const main = "navi";');

  const mockExecutor = async (cmd: string, args: readonly string[]) => {
    await writeFile(join(dir, "src", "output.ts"), 'export const output = true;');
    return {
      exitCode: 0,
      stdout: "Mock execution succeeded",
      stderr: "",
      passed: true,
      durationMs: 12
    };
  };

  const result = await runNaviExecute(dir, "gemini", mockExecutor);
  assert.equal(result.agent, "gemini");
  assert.equal(result.execution.passed, true);
  assert.equal(result.execution.exitCode, 0);
  assert.equal(typeof result.authorized, "boolean");

  const report = executionReport(result);
  assert.match(report, /NAVI EXECUTION RUNNER \/\/ SINGLE-CONTRACT DISPATCH/);
  assert.match(report, /2\. AGENT DISPATCH & EXECUTION/);
  assert.match(report, /3\. POST-EXECUTION REPOSITORY CHANGES/);

  const json = JSON.parse(executionJson(result));
  assert.equal(json.agent, "gemini");
  assert.equal(json.execution.passed, true);
}));

test("creates, saves, loads, and lists verified checkpoints deterministically", async () => withTempDir(async (dir) => {
  const verifications = [
    { command: "npm test", passed: true },
    { command: "npm run build --silent", passed: true }
  ];
  const fingerprint = { totalFiles: 2, sourceFiles: ["src/index.ts", "src/core/state.ts"] };
  const artifacts = { primaryFiles: ["src/index.ts"], dependencyNeighborhood: [], verificationCommands: ["npm test"] };

  const cp = createCheckpoint(1, 1, "abc1234", "main", "2026-08-05T00:00:00.000Z", verifications, fingerprint, artifacts);
  assert.equal(cp.id, 1);
  assert.equal(cp.transitionId, 1);
  assert.equal(cp.allPassed, true);
  assert.equal(cp.commit, "abc1234");

  const path = await saveCheckpoint(dir, cp);
  assert.match(path, /checkpoint-1\.json/);

  const loaded = await loadCheckpoint(dir, 1);
  assert.deepEqual(loaded, cp);

  const latest = await loadLatestCheckpoint(dir);
  assert.deepEqual(latest, cp);

  const list = await listCheckpoints(dir);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], cp);
}));

test("compares verified checkpoints and produces a deterministic diff", async () => withTempDir(async (dir) => {
  const fp1 = { totalFiles: 1, sourceFiles: ["src/index.ts"] };
  const fp2 = { totalFiles: 2, sourceFiles: ["src/index.ts", "src/core/new.ts"] };
  const arts = { primaryFiles: [], dependencyNeighborhood: [], verificationCommands: [] };
  const vr = [{ command: "npm test", passed: true }];

  const cp1 = createCheckpoint(1, 1, "abc1234", "main", "2026-08-05T00:00:00.000Z", vr, fp1, arts);
  const cp2 = createCheckpoint(2, 2, "def5678", "main", "2026-08-05T01:00:00.000Z", vr, fp2, arts);

  const diff = compareCheckpoints(cp1, cp2);
  assert.equal(diff.commitChanged, true);
  assert.deepEqual(diff.filesAdded, ["src/core/new.ts"]);
  assert.deepEqual(diff.filesRemoved, []);
  assert.equal(diff.verificationStatusChanged, false);

  const report = checkpointDiffReport(diff);
  assert.match(report, /NAVI CHECKPOINT DIFF/);
  assert.match(report, /Files Added/);

  const nullDiff = compareCheckpoints(null, cp1);
  assert.equal(nullDiff.previous, null);
  assert.deepEqual(nullDiff.filesAdded, ["src/index.ts"]);
}));

test("checkpoint report formats deterministically", async () => withTempDir(async (dir) => {
  const vr = [{ command: "npm test", passed: true }];
  const fp = { totalFiles: 1, sourceFiles: ["src/index.ts"] };
  const arts = { primaryFiles: ["src/index.ts"], dependencyNeighborhood: [], verificationCommands: ["npm test"] };
  const cp = createCheckpoint(1, 1, "abc1234", "main", "2026-08-05T00:00:00.000Z", vr, fp, arts);

  const report = checkpointReport(cp);
  assert.match(report, /NAVI VERIFIED CHECKPOINT \/\/ TURN 1/);
  assert.match(report, /Commit: abc1234/);
  assert.match(report, /PASS: npm test/);
  assert.match(report, /REPOSITORY FINGERPRINT/);

  const json = JSON.parse(checkpointJson(cp));
  assert.equal(json.commit, "abc1234");
  assert.equal(json.allPassed, true);
}));

test("execution runner creates a verified checkpoint on successful authorized run", async () => withTempDir(async (dir) => {
  await initializeState(dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "main.ts"), 'export const main = "navi";');

  const mockExecutor = async () => ({
    exitCode: 0, stdout: "ok", stderr: "", passed: true, durationMs: 5
  });

  const result = await runNaviExecute(dir, "gemini", mockExecutor);
  const report = executionReport(result);
  assert.match(report, /7\. VERIFIED CHECKPOINT/);
}));






