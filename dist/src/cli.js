#!/usr/bin/env node
import { navigationContract } from "./core/navigate.js";
import { buildContext, contextJson, contextReport } from "./core/context.js";
import { initializeState, readState } from "./core/state.js";
import { findDoNotTouchViolations, findScopeViolations, runVerification, validateState, validationReport } from "./core/validate.js";
import { RepositoryObserver, repositoryObservationJson, repositoryObservationReport } from "./adapters/repository.js";
import { RepositoryIndexService } from "./adapters/repository-index.js";
import { createTransition, formatTransition, loadTransition, saveTransition, transitionJson, transitionReport, validateTransition } from "./core/transition.js";
import { runNaviStart, startJson, startReport } from "./core/start.js";
import { executionJson, executionReport, runNaviExecute } from "./core/execution.js";
import { checkpointJson, checkpointReport, loadLatestCheckpoint, listCheckpoints } from "./core/checkpoint.js";
const command = process.argv[2];
const subcommand = process.argv[3];
const jsonOutput = process.argv.includes("--json");
const projectDir = process.cwd();
function printMissingState() {
    console.error("Navi is not initialized. Run: navi init");
}
async function main() {
    if (command === "init") {
        const result = await initializeState(projectDir);
        console.log(result.created ? "Initialized Navi in .navi/state.json" : "Navi is already initialized; state was not changed.");
        return;
    }
    if (command === "observe") {
        const [index, state, build, tests, latestCheckpoint] = await Promise.all([
            new RepositoryObserver().observe(projectDir),
            readState(projectDir),
            runVerification("npm run build --silent", projectDir),
            runVerification("npm test", projectDir),
            loadLatestCheckpoint(projectDir)
        ]);
        const changedFiles = [...new Set([...index.modifiedFiles, ...index.untrackedFiles, ...index.deletedFiles])];
        const scopeViolations = state ? findScopeViolations(changedFiles, state.currentTurn.scope) : null;
        const protectedPathViolations = state ? findDoNotTouchViolations(changedFiles, state.currentTurn.doNotTouch) : null;
        const readiness = {
            state: state?.status ?? "Not initialized",
            scopeViolations,
            protectedPathViolations,
            verifications: [
                { name: "TypeScript", passed: build.passed },
                { name: "Tests", passed: tests.passed }
            ],
            lastVerified: state?.lastVerified ?? null
        };
        if (jsonOutput) {
            console.log(JSON.stringify({ ...JSON.parse(repositoryObservationJson(index, readiness)), latestCheckpoint }, null, 2));
        }
        else {
            const checkpointLine = latestCheckpoint
                ? `\nLAST VERIFIED CHECKPOINT\n────────────────────────\nCommit: ${latestCheckpoint.commit ?? "N/A"} | Timestamp: ${latestCheckpoint.timestamp} | Passed: ${latestCheckpoint.allPassed ? "YES" : "NO"}`
                : "\nLAST VERIFIED CHECKPOINT\n────────────────────────\nNo checkpoint found.";
            console.log(repositoryObservationReport(index, readiness) + checkpointLine);
        }
        if (index.error)
            process.exitCode = 1;
        return;
    }
    const state = await readState(projectDir);
    if (!state) {
        printMissingState();
        process.exitCode = 1;
        return;
    }
    if (command === "status") {
        console.log([
            "NAVI STATUS",
            "",
            `Status: ${state.status}`,
            `Turn: ${state.currentTurn.id}`,
            "",
            "Destination:",
            state.destination || "Not defined",
            "",
            "Position:",
            state.position || "Not defined",
            "",
            "Current Task:",
            state.currentTurn.task || "Not defined"
        ].join("\n"));
        return;
    }
    if (command === "navigate") {
        console.log(navigationContract(state));
        return;
    }
    if (command === "context") {
        const index = await new RepositoryIndexService().parse(projectDir);
        const transition = await loadTransition(projectDir, state.currentTurn.id);
        const context = buildContext(index, transition ?? state);
        console.log(jsonOutput ? contextJson(context) : contextReport(context));
        return;
    }
    if (command === "validate") {
        const result = await validateState(projectDir, state);
        console.log(validationReport(result));
        if (!result.passed)
            process.exitCode = 1;
        return;
    }
    if (command === "transition") {
        let transition = await loadTransition(projectDir, state.currentTurn.id);
        if (subcommand === "create" || subcommand === "propose") {
            transition = createTransition(state);
            const path = await saveTransition(projectDir, transition);
            if (jsonOutput) {
                console.log(JSON.stringify({ created: true, path, transition }, null, 2));
            }
            else {
                console.log(`Created Navi transition ${transition.id} at ${path}`);
            }
            return;
        }
        if (subcommand === "validate") {
            const activeTransition = transition ?? createTransition(state);
            const result = await validateTransition(projectDir, activeTransition);
            console.log(jsonOutput ? transitionJson(result) : transitionReport(result));
            if (!result.passed)
                process.exitCode = 1;
            return;
        }
        const activeTransition = transition ?? createTransition(state);
        console.log(jsonOutput ? transitionJson(activeTransition) : formatTransition(activeTransition));
        return;
    }
    if (command === "start") {
        const agentArgIndex = process.argv.indexOf("--agent");
        const agentType = agentArgIndex !== -1 && process.argv[agentArgIndex + 1] ? process.argv[agentArgIndex + 1] : "gemini";
        const [result, latestCheckpoint] = await Promise.all([
            runNaviStart(projectDir, agentType),
            loadLatestCheckpoint(projectDir)
        ]);
        if (jsonOutput) {
            console.log(JSON.stringify({ ...JSON.parse(startJson(result)), latestCheckpoint }, null, 2));
        }
        else {
            const checkpointLine = latestCheckpoint
                ? `\n8. LAST VERIFIED CHECKPOINT\n---------------------------\nCommit: ${latestCheckpoint.commit ?? "N/A"} | Timestamp: ${latestCheckpoint.timestamp} | Passed: ${latestCheckpoint.allPassed ? "YES" : "NO"}`
                : `\n8. LAST VERIFIED CHECKPOINT\n---------------------------\nNo checkpoint found.`;
            console.log(startReport(result) + checkpointLine);
        }
        if (!result.authorized)
            process.exitCode = 1;
        return;
    }
    if (command === "run" || command === "execute") {
        const agentArgIndex = process.argv.indexOf("--agent");
        const agentType = agentArgIndex !== -1 && process.argv[agentArgIndex + 1] ? process.argv[agentArgIndex + 1] : "gemini";
        const result = await runNaviExecute(projectDir, agentType);
        console.log(jsonOutput ? executionJson(result) : executionReport(result));
        if (!result.authorized || !result.execution.passed)
            process.exitCode = 1;
        return;
    }
    if (command === "checkpoint") {
        if (subcommand === "list") {
            const checkpoints = await listCheckpoints(projectDir);
            if (jsonOutput) {
                console.log(JSON.stringify(checkpoints, null, 2));
            }
            else {
                if (checkpoints.length === 0) {
                    console.log("No checkpoints found.");
                }
                else {
                    for (const cp of checkpoints)
                        console.log(checkpointReport(cp));
                }
            }
            return;
        }
        const cp = await loadLatestCheckpoint(projectDir);
        if (!cp) {
            console.log("No checkpoint found.");
            return;
        }
        console.log(jsonOutput ? checkpointJson(cp) : checkpointReport(cp));
        return;
    }
    console.error("Usage: navi <checkpoint|context|execute|init|navigate|observe|run|start|status|transition|validate>");
    process.exitCode = 1;
}
void main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Navi could not read state: ${message}`);
    process.exitCode = 1;
});
