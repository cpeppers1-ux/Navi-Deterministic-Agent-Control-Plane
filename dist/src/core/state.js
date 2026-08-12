import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeTextFile } from "../utils/files.js";
export const initialState = () => ({
    version: "0.1.0",
    destination: "",
    position: "",
    currentTurn: {
        id: 1,
        task: "",
        scope: [],
        acceptance: [],
        doNotTouch: [],
        verify: []
    },
    status: "AUTHORIZED"
});
export const statePath = (projectDir) => join(projectDir, ".navi", "state.json");
export async function initializeState(projectDir) {
    const path = statePath(projectDir);
    try {
        await writeTextFile(path, `${JSON.stringify(initialState(), null, 2)}\n`, true);
        return { created: true, path };
    }
    catch (error) {
        if (error.code === "EEXIST")
            return { created: false, path };
        throw error;
    }
}
function isState(value) {
    if (!value || typeof value !== "object")
        return false;
    const state = value;
    const turn = state.currentTurn;
    const lastVerified = state.lastVerified;
    const isStringList = (item) => Array.isArray(item) && item.every((entry) => typeof entry === "string");
    const isLastVerified = !lastVerified || (typeof lastVerified.commit === "string"
        && (lastVerified.typeScript === "PASS" || lastVerified.typeScript === "FAIL")
        && (lastVerified.tests === "PASS" || lastVerified.tests === "FAIL")
        && typeof lastVerified.timestamp === "string");
    return state.version === "0.1.0"
        && typeof state.destination === "string"
        && typeof state.position === "string"
        && state.status === "AUTHORIZED"
        && !!turn
        && Number.isInteger(turn.id)
        && typeof turn.task === "string"
        && isStringList(turn.scope)
        && isStringList(turn.acceptance)
        && isStringList(turn.doNotTouch)
        && isStringList(turn.verify)
        && isLastVerified;
}
export async function readState(projectDir) {
    const path = statePath(projectDir);
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
        throw new Error("Navi state is not valid JSON.");
    }
    if (!isState(parsed))
        throw new Error("Navi state does not match the expected schema.");
    return parsed;
}
