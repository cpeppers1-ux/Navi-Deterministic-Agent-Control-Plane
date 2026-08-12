import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeTextFile } from "../utils/files.js";
import type { VerificationResult } from "./validate.js";

export type RepositoryFingerprint = {
  readonly totalFiles: number;
  readonly sourceFiles: readonly string[];
};

export type CheckpointArtifactSummary = {
  readonly primaryFiles: readonly string[];
  readonly dependencyNeighborhood: readonly string[];
  readonly verificationCommands: readonly string[];
};

export type NaviCheckpoint = {
  readonly id: number;
  readonly transitionId: number;
  readonly commit: string | null;
  readonly branch: string | null;
  readonly timestamp: string;
  readonly verifications: readonly VerificationResult[];
  readonly allPassed: boolean;
  readonly fingerprint: RepositoryFingerprint;
  readonly artifacts: CheckpointArtifactSummary;
};

export const checkpointDir = (projectDir: string): string =>
  join(projectDir, ".navi", "checkpoints");

export const checkpointPath = (projectDir: string, id: number): string =>
  join(checkpointDir(projectDir), `checkpoint-${id}.json`);

export const latestCheckpointPath = (projectDir: string): string =>
  join(checkpointDir(projectDir), "latest.json");

export function createCheckpoint(
  id: number,
  transitionId: number,
  commit: string | null,
  branch: string | null,
  timestamp: string,
  verifications: readonly VerificationResult[],
  fingerprint: RepositoryFingerprint,
  artifacts: CheckpointArtifactSummary
): NaviCheckpoint {
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

export function isCheckpoint(value: unknown): value is NaviCheckpoint {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const isStringList = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every((e) => typeof e === "string");
  const fp = c.fingerprint as Record<string, unknown> | undefined;
  const art = c.artifacts as Record<string, unknown> | undefined;

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

export async function saveCheckpoint(projectDir: string, checkpoint: NaviCheckpoint): Promise<string> {
  const path = checkpointPath(projectDir, checkpoint.id);
  const contents = `${JSON.stringify(checkpoint, null, 2)}\n`;
  await writeTextFile(path, contents, false);
  await writeTextFile(latestCheckpointPath(projectDir), contents, false);
  return path;
}

export async function loadCheckpoint(projectDir: string, id: number): Promise<NaviCheckpoint | null> {
  const path = checkpointPath(projectDir, id);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`Navi checkpoint ${id} is not valid JSON.`);
  }
  if (!isCheckpoint(parsed)) throw new Error(`Navi checkpoint ${id} does not match expected schema.`);
  return parsed;
}

export async function loadLatestCheckpoint(projectDir: string): Promise<NaviCheckpoint | null> {
  const path = latestCheckpointPath(projectDir);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Navi latest checkpoint is not valid JSON.");
  }
  if (!isCheckpoint(parsed)) throw new Error("Navi latest checkpoint does not match expected schema.");
  return parsed;
}

export async function listCheckpoints(projectDir: string): Promise<readonly NaviCheckpoint[]> {
  const dir = checkpointDir(projectDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const checkpoints: NaviCheckpoint[] = [];
  for (const entry of entries) {
    const match = entry.match(/^checkpoint-(\d+)\.json$/);
    if (match) {
      const id = parseInt(match[1], 10);
      const cp = await loadCheckpoint(projectDir, id);
      if (cp) checkpoints.push(cp);
    }
  }
  return checkpoints.sort((a, b) => a.id - b.id);
}

export type CheckpointDiff = {
  readonly previous: NaviCheckpoint | null;
  readonly current: NaviCheckpoint;
  readonly commitChanged: boolean;
  readonly filesAdded: readonly string[];
  readonly filesRemoved: readonly string[];
  readonly verificationStatusChanged: boolean;
};

export function compareCheckpoints(previous: NaviCheckpoint | null, current: NaviCheckpoint): CheckpointDiff {
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

function listed(items: readonly string[], empty: string): string[] {
  return items.length ? items.map((i) => `- ${i}`) : [empty];
}

export function checkpointReport(checkpoint: NaviCheckpoint): string {
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

export function checkpointDiffReport(diff: CheckpointDiff): string {
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

export function checkpointJson(checkpoint: NaviCheckpoint): string {
  return JSON.stringify(checkpoint, null, 2);
}
