import { RepositoryIndexService } from "../adapters/repository-index.js";
import { RepositoryObserver } from "../adapters/repository.js";
import { getAgentAdapter } from "../adapters/agent-runner.js";
import { buildContext } from "./context.js";
import { navigationContract } from "./navigate.js";
import { readState } from "./state.js";
import { createTransition, loadTransition, saveTransition, validateTransition } from "./transition.js";
export async function runNaviStart(projectDir, agentType = "gemini") {
    const state = await readState(projectDir);
    if (!state) {
        throw new Error("Navi is not initialized. Run: navi init");
    }
    const observer = new RepositoryObserver();
    const indexService = new RepositoryIndexService();
    const [observation, repoIndex] = await Promise.all([
        observer.observe(projectDir),
        indexService.parse(projectDir)
    ]);
    let transition = await loadTransition(projectDir, state.currentTurn.id);
    if (!transition) {
        transition = createTransition(state);
        await saveTransition(projectDir, transition);
    }
    const context = buildContext(repoIndex, transition);
    const contract = navigationContract(state);
    const validation = await validateTransition(projectDir, transition);
    const authorized = !observation.error && state.status === "AUTHORIZED" && validation.passed;
    const adapter = getAgentAdapter(agentType);
    const capabilities = await adapter.detectCapabilities();
    const configValidation = adapter.validateConfig({ agent: adapter.agentType });
    const formattedRequest = adapter.formatRequest({
        contract,
        task: transition.task,
        context,
        transition
    });
    return {
        state,
        observation,
        transition,
        context,
        contract,
        validation,
        authorized,
        agent: {
            type: adapter.agentType,
            capabilities,
            validConfig: configValidation.valid,
            request: formattedRequest
        }
    };
}
export function startReport(result) {
    return [
        "NAVI START // CLOSED-LOOP ORCHESTRATION",
        "=========================================",
        "",
        "1. REPOSITORY OBSERVATION",
        "------------------------",
        `Branch: ${result.observation.branch ?? "Not available"}`,
        `HEAD: ${result.observation.head ?? "Not available"}`,
        `Modified: ${result.observation.modifiedFiles.length}, Untracked: ${result.observation.untrackedFiles.length}, Deleted: ${result.observation.deletedFiles.length}`,
        result.observation.error ? `Error: ${result.observation.error}` : "Status: Clean working tree observed.",
        "",
        "2. ACTIVE TRANSITION",
        "--------------------",
        `Turn ID: ${result.transition.id}`,
        `Status: ${result.transition.status}`,
        `Task: ${result.transition.task || "Not defined."}`,
        "",
        "3. BOUNDED CONTEXT",
        "------------------",
        `Primary Files (${result.context.primaryFiles.length}): ${result.context.primaryFiles.join(", ") || "None"}`,
        `Neighborhood (${result.context.dependencyNeighborhood.length}): ${result.context.dependencyNeighborhood.join(", ") || "None"}`,
        `Tokens Saved: ${result.context.tokenSaver.estimatedTokensSaved}`,
        "",
        "4. EXECUTION CONTRACT",
        "---------------------",
        result.contract,
        "",
        "5. VERIFICATION & VALIDATION",
        "----------------------------",
        `Scope Violations: ${result.validation.scopeViolations.length ? result.validation.scopeViolations.join(", ") : "None"}`,
        `Protected Violations: ${result.validation.protectedPathViolations.length ? result.validation.protectedPathViolations.join(", ") : "None"}`,
        ...(result.validation.verifications.length
            ? result.validation.verifications.map((v) => `${v.passed ? "PASS" : "FAIL"}: ${v.command}`)
            : ["No verification commands specified."]),
        "",
        "6. TRANSITION AUTHORIZATION",
        "---------------------------",
        `Authorized: ${result.authorized ? "YES" : "NO"}`,
        "",
        "7. AGENT ADAPTER DISPATCH",
        "-------------------------",
        `Agent: ${result.agent.type} (Available: ${result.agent.capabilities.available ? "YES" : "NO"})`,
        `Valid Config: ${result.agent.validConfig ? "YES" : "NO"}`,
        `Command: ${result.agent.request.commandLine.join(" ")}`
    ].join("\n");
}
export function startJson(result) {
    return JSON.stringify(result, null, 2);
}
