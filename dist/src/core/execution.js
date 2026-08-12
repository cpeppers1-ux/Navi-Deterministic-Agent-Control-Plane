import { getAgentAdapter } from "../adapters/agent-runner.js";
import { RepositoryIndexService } from "../adapters/repository-index.js";
import { RepositoryObserver } from "../adapters/repository.js";
import { createCheckpoint, loadLatestCheckpoint, saveCheckpoint } from "./checkpoint.js";
import { buildContext } from "./context.js";
import { runNaviStart } from "./start.js";
import { validateTransition } from "./transition.js";
export async function runNaviExecute(projectDir, agentType = "gemini", executor) {
    const startResult = await runNaviStart(projectDir, agentType);
    const adapter = getAgentAdapter(agentType, undefined, executor);
    const execution = await adapter.execute(startResult.agent.request, { cwd: projectDir });
    const observer = new RepositoryObserver();
    const indexService = new RepositoryIndexService();
    const [postObservation, postIndex] = await Promise.all([
        observer.observe(projectDir),
        indexService.parse(projectDir)
    ]);
    const postContext = buildContext(postIndex, startResult.transition);
    const validation = await validateTransition(projectDir, startResult.transition);
    const authorized = execution.passed && !postObservation.error && validation.passed;
    let checkpoint = null;
    if (authorized) {
        const previous = await loadLatestCheckpoint(projectDir);
        const nextId = previous ? previous.id + 1 : 1;
        const timestamp = new Date().toISOString();
        checkpoint = createCheckpoint(nextId, startResult.transition.id, postObservation.head ?? null, postObservation.branch ?? null, timestamp, validation.verifications, {
            totalFiles: postIndex.records.length,
            sourceFiles: postIndex.records.map((r) => r.path)
        }, {
            primaryFiles: postContext.primaryFiles,
            dependencyNeighborhood: postContext.dependencyNeighborhood,
            verificationCommands: postContext.verificationCommands
        });
        await saveCheckpoint(projectDir, checkpoint);
    }
    return {
        transition: startResult.transition,
        agent: adapter.agentType,
        execution,
        postObservation,
        postContext,
        validation,
        authorized,
        checkpoint
    };
}
export function executionReport(result) {
    const checkpointSection = result.checkpoint
        ? [
            "",
            "7. VERIFIED CHECKPOINT",
            "----------------------",
            `Checkpoint ID: ${result.checkpoint.id}`,
            `Commit: ${result.checkpoint.commit ?? "Not available"}`,
            `Timestamp: ${result.checkpoint.timestamp}`,
            `All Verifications Passed: ${result.checkpoint.allPassed ? "YES" : "NO"}`
        ]
        : [
            "",
            "7. VERIFIED CHECKPOINT",
            "----------------------",
            "No checkpoint created (execution did not produce authorized state)."
        ];
    return [
        "NAVI EXECUTION RUNNER // SINGLE-CONTRACT DISPATCH",
        "================================================",
        "",
        "1. REQUESTED TRANSITION",
        "-----------------------",
        `Turn ID: ${result.transition.id}`,
        `Task: ${result.transition.task || "Not defined."}`,
        `Status: ${result.transition.status}`,
        "",
        "2. AGENT DISPATCH & EXECUTION",
        "-----------------------------",
        `Agent: ${result.agent}`,
        `Passed: ${result.execution.passed ? "YES" : "NO"}`,
        `Exit Code: ${result.execution.exitCode}`,
        `Duration: ${result.execution.durationMs}ms`,
        "",
        "3. POST-EXECUTION REPOSITORY CHANGES",
        "------------------------------------",
        `Branch: ${result.postObservation.branch ?? "Not available"}`,
        `HEAD: ${result.postObservation.head ?? "Not available"}`,
        `Modified (${result.postObservation.modifiedFiles.length}): ${result.postObservation.modifiedFiles.join(", ") || "None"}`,
        `Untracked (${result.postObservation.untrackedFiles.length}): ${result.postObservation.untrackedFiles.join(", ") || "None"}`,
        `Deleted (${result.postObservation.deletedFiles.length}): ${result.postObservation.deletedFiles.join(", ") || "None"}`,
        "",
        "4. REGENERATED CONTEXT",
        "----------------------",
        `Primary Files (${result.postContext.primaryFiles.length}): ${result.postContext.primaryFiles.join(", ") || "None"}`,
        `Neighborhood (${result.postContext.dependencyNeighborhood.length}): ${result.postContext.dependencyNeighborhood.join(", ") || "None"}`,
        "",
        "5. VERIFICATION & VALIDATION",
        "----------------------------",
        `Scope Violations: ${result.validation.scopeViolations.length ? result.validation.scopeViolations.join(", ") : "None"}`,
        `Protected Violations: ${result.validation.protectedPathViolations.length ? result.validation.protectedPathViolations.join(", ") : "None"}`,
        ...(result.validation.verifications.length
            ? result.validation.verifications.map((v) => `${v.passed ? "PASS" : "FAIL"}: ${v.command}`)
            : ["No verification commands specified."]),
        "",
        "6. TRANSITION AUTHORIZATION OUTCOME",
        "-----------------------------------",
        `Authorized: ${result.authorized ? "YES" : "NO"}`,
        ...checkpointSection
    ].join("\n");
}
export function executionJson(result) {
    return JSON.stringify(result, null, 2);
}
