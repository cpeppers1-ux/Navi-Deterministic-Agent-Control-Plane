import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeTextFile } from "../utils/files.js";
import { findDoNotTouchViolations, findScopeViolations, observeGitDiff, runVerification } from "./validate.js";
export const transitionDir = (projectDir) => join(projectDir, ".navi", "transitions");
export const transitionPath = (projectDir, id) => join(transitionDir(projectDir), `transition-${id}.json`);
export function createTransition(state, overrides) {
    return {
        id: state.currentTurn.id,
        task: overrides?.task ?? state.currentTurn.task,
        scope: overrides?.scope ?? state.currentTurn.scope,
        acceptance: overrides?.acceptance ?? state.currentTurn.acceptance,
        doNotTouch: overrides?.doNotTouch ?? state.currentTurn.doNotTouch,
        verify: overrides?.verify ?? state.currentTurn.verify,
        status: overrides?.status ?? "PROPOSED",
        timestamp: overrides?.timestamp ?? "2026-08-05T00:00:00.000Z",
        positionBefore: overrides?.positionBefore ?? (state.position || "Not defined"),
        positionAfter: overrides?.positionAfter ?? (state.destination || "Not defined")
    };
}
export function isTransition(value) {
    if (!value || typeof value !== "object")
        return false;
    const t = value;
    const isStringList = (item) => Array.isArray(item) && item.every((entry) => typeof entry === "string");
    const validStatus = ["PROPOSED", "AUTHORIZED", "VALIDATED", "REJECTED"].includes(t.status);
    return typeof t.id === "number"
        && typeof t.task === "string"
        && isStringList(t.scope)
        && isStringList(t.acceptance)
        && isStringList(t.doNotTouch)
        && isStringList(t.verify)
        && validStatus
        && typeof t.timestamp === "string"
        && typeof t.positionBefore === "string"
        && typeof t.positionAfter === "string";
}
export async function saveTransition(projectDir, transition) {
    const path = transitionPath(projectDir, transition.id);
    await writeTextFile(path, `${JSON.stringify(transition, null, 2)}\n`, false);
    return path;
}
export async function loadTransition(projectDir, id) {
    const path = transitionPath(projectDir, id);
    let contents;
    try {
        contents = await readFile(path, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    let parsed;
    try {
        parsed = JSON.parse(contents);
    }
    catch {
        throw new Error(`Navi transition ${id} is not valid JSON.`);
    }
    if (!isTransition(parsed)) {
        throw new Error(`Navi transition ${id} does not match expected schema.`);
    }
    return parsed;
}
export async function listTransitions(projectDir) {
    const dir = transitionDir(projectDir);
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch {
        return [];
    }
    const transitions = [];
    for (const entry of entries) {
        const match = entry.match(/^transition-(\d+)\.json$/);
        if (match) {
            const id = parseInt(match[1], 10);
            const transition = await loadTransition(projectDir, id);
            if (transition)
                transitions.push(transition);
        }
    }
    return transitions.sort((a, b) => a.id - b.id);
}
const defaultDependencies = { observeGitDiff, runVerification };
export async function validateTransition(projectDir, transition, dependencies = defaultDependencies) {
    const git = await dependencies.observeGitDiff(projectDir);
    if (git.error) {
        return {
            transition,
            scopeViolations: [],
            protectedPathViolations: [],
            verifications: [],
            passed: false,
            error: git.error
        };
    }
    const scopeViolations = findScopeViolations(git.changedFiles, [...transition.scope]);
    const protectedPathViolations = findDoNotTouchViolations(git.changedFiles, [...transition.doNotTouch]);
    const verifications = await Promise.all(transition.verify.map((command) => dependencies.runVerification(command, projectDir)));
    const passed = scopeViolations.length === 0
        && protectedPathViolations.length === 0
        && verifications.every((v) => v.passed);
    return {
        transition,
        scopeViolations,
        protectedPathViolations,
        verifications,
        passed
    };
}
function listed(items, empty) {
    return items.length ? items.map((item) => `- ${item}`) : [empty];
}
export function formatTransition(transition) {
    return [
        `NAVI TRANSITION // TURN ${transition.id}`,
        "",
        `Status: ${transition.status}`,
        `Timestamp: ${transition.timestamp}`,
        "",
        "POSITION BEFORE",
        transition.positionBefore || "Not defined.",
        "",
        "POSITION AFTER",
        transition.positionAfter || "Not defined.",
        "",
        "TASK",
        transition.task || "Not defined.",
        "",
        "SCOPE",
        ...listed(transition.scope, "None specified."),
        "",
        "ACCEPTANCE",
        ...listed(transition.acceptance, "None specified."),
        "",
        "DO NOT TOUCH",
        ...listed(transition.doNotTouch, "None specified."),
        "",
        "VERIFY",
        ...listed(transition.verify, "None specified.")
    ].join("\n");
}
export function transitionReport(result) {
    return [
        `NAVI TRANSITION VALIDATION // TURN ${result.transition.id}`,
        "",
        `Status: ${result.transition.status}`,
        "",
        "SCOPE VIOLATIONS",
        ...listed(result.scopeViolations, "No scope violations."),
        "",
        "PROTECTED PATH VIOLATIONS",
        ...listed(result.protectedPathViolations, "No protected path violations."),
        "",
        "VERIFICATION COMMANDS",
        ...(result.verifications.length
            ? result.verifications.map((v) => `- ${v.passed ? "PASS" : "FAIL"}: ${v.command}`)
            : ["No verification commands specified."]),
        "",
        `RESULT: ${result.passed ? "PASS" : "FAIL"}`
    ].join("\n");
}
export function transitionJson(result) {
    return JSON.stringify(result, null, 2);
}
