import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeTextFile } from "../utils/files.js";
export const checkpointDir = (projectDir) => join(projectDir, ".navi", "checkpoints");
export const checkpointPath = (projectDir, id) => join(checkpointDir(projectDir), `checkpoint-${id}.json`);
export const latestCheckpointPath = (projectDir) => join(checkpointDir(projectDir), "latest.json");
export function createCheckpoint(id, transitionId, commit, branch, timestamp, verifications, fingerprint, artifacts) {
    const allPassed = verifications.length > 0 && verifications.every((v) => v.passed);
    return {
        id,
        transitionId,
        commit,
        branch,
        timestamp,
        verifications,
        allPassed,
        fingerprint,
        artifacts
    };
}
export function isCheckpoint(value) {
    if (!value || typeof value !== "object")
        return false;
    const c = value;
    const isStringList = (item) => Array.isArray(item) && item.every((e) => typeof e === "string");
    const fp = c.fingerprint;
    const art = c.artifacts;
    return typeof c.id === "number"
        && typeof c.transitionId === "number"
        && (c.commit === null || typeof c.commit === "string")
        && (c.branch === null || typeof c.branch === "string")
        && typeof c.timestamp === "string"
        && Array.isArray(c.verifications)
        && typeof c.allPassed === "boolean"
        && !!fp
        && typeof fp.totalFiles === "number"
        && isStringList(fp.sourceFiles)
        && !!art
        && isStringList(art.primaryFiles)
        && isStringList(art.dependencyNeighborhood)
        && isStringList(art.verificationCommands);
}
export async function saveCheckpoint(projectDir, checkpoint) {
    const path = checkpointPath(projectDir, checkpoint.id);
    const contents = `${JSON.stringify(checkpoint, null, 2)}\n`;
    await writeTextFile(path, contents, false);
    await writeTextFile(latestCheckpointPath(projectDir), contents, false);
    return path;
}
export async function loadCheckpoint(projectDir, id) {
    const path = checkpointPath(projectDir, id);
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
        throw new Error(`Navi checkpoint ${id} is not valid JSON.`);
    }
    if (!isCheckpoint(parsed))
        throw new Error(`Navi checkpoint ${id} does not match expected schema.`);
    return parsed;
}
export async function loadLatestCheckpoint(projectDir) {
    const path = latestCheckpointPath(projectDir);
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
        throw new Error("Navi latest checkpoint is not valid JSON.");
    }
    if (!isCheckpoint(parsed))
        throw new Error("Navi latest checkpoint does not match expected schema.");
    return parsed;
}
export async function listCheckpoints(projectDir) {
    const dir = checkpointDir(projectDir);
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch {
        return [];
    }
    const checkpoints = [];
    for (const entry of entries) {
        const match = entry.match(/^checkpoint-(\d+)\.json$/);
        if (match) {
            const id = parseInt(match[1], 10);
            const cp = await loadCheckpoint(projectDir, id);
            if (cp)
                checkpoints.push(cp);
        }
    }
    return checkpoints.sort((a, b) => a.id - b.id);
}
export function compareCheckpoints(previous, current) {
    if (!previous) {
        return {
            previous: null,
            current,
            commitChanged: true,
            filesAdded: [...current.fingerprint.sourceFiles],
            filesRemoved: [],
            verificationStatusChanged: true
        };
    }
    const prevFiles = new Set(previous.fingerprint.sourceFiles);
    const currFiles = new Set(current.fingerprint.sourceFiles);
    const filesAdded = [...currFiles].filter((f) => !prevFiles.has(f));
    const filesRemoved = [...prevFiles].filter((f) => !currFiles.has(f));
    return {
        previous,
        current,
        commitChanged: previous.commit !== current.commit,
        filesAdded,
        filesRemoved,
        verificationStatusChanged: previous.allPassed !== current.allPassed
    };
}
function listed(items, empty) {
    return items.length ? items.map((i) => `- ${i}`) : [empty];
}
export function checkpointReport(checkpoint) {
    return [
        `NAVI VERIFIED CHECKPOINT // TURN ${checkpoint.transitionId}`,
        "",
        `ID: ${checkpoint.id}`,
        `Timestamp: ${checkpoint.timestamp}`,
        `Commit: ${checkpoint.commit ?? "Not available"}`,
        `Branch: ${checkpoint.branch ?? "Not available"}`,
        `All Verifications Passed: ${checkpoint.allPassed ? "YES" : "NO"}`,
        "",
        "VERIFICATION RESULTS",
        "--------------------",
        ...(checkpoint.verifications.length
            ? checkpoint.verifications.map((v) => `${v.passed ? "PASS" : "FAIL"}: ${v.command}`)
            : ["No verification commands specified."]),
        "",
        "REPOSITORY FINGERPRINT",
        "----------------------",
        `Total Files: ${checkpoint.fingerprint.totalFiles}`,
        ...listed(checkpoint.fingerprint.sourceFiles, "No source files."),
        "",
        "ARTIFACT SUMMARY",
        "----------------",
        `Primary Files: ${checkpoint.artifacts.primaryFiles.join(", ") || "None"}`,
        `Neighborhood: ${checkpoint.artifacts.dependencyNeighborhood.join(", ") || "None"}`,
        `Verify: ${checkpoint.artifacts.verificationCommands.join(", ") || "None"}`
    ].join("\n");
}
export function checkpointDiffReport(diff) {
    return [
        "NAVI CHECKPOINT DIFF",
        "--------------------",
        `Previous Commit: ${diff.previous?.commit ?? "None"}`,
        `Current Commit:  ${diff.current.commit ?? "Not available"}`,
        `Commit Changed: ${diff.commitChanged ? "YES" : "NO"}`,
        `Verification Status Changed: ${diff.verificationStatusChanged ? "YES" : "NO"}`,
        "",
        "Files Added:",
        ...listed(diff.filesAdded, "None"),
        "",
        "Files Removed:",
        ...listed(diff.filesRemoved, "None")
    ].join("\n");
}
export function checkpointJson(checkpoint) {
    return JSON.stringify(checkpoint, null, 2);
}
