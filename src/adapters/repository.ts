import { observeGitDiff } from "../core/validate.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RepositoryOutputRecord = {
  readonly path: string;
  readonly imports: readonly string[];
  readonly importedBy: readonly string[];
  readonly exports: readonly string[];
  readonly subsystem: string;
};

/** Describes the in-memory source-file index available to future engine work. */
export interface RepositoryIndex {
  readonly projectDir: string;
  readonly records: readonly RepositoryOutputRecord[];
}

/**
 * Builds a repository index from the current project directory.
 */
export interface RepositoryParser {
  parse(projectDir: string): Promise<RepositoryIndex>;
}

export type RepositoryObservation = {
  readonly projectDir: string;
  readonly files: readonly string[];
  readonly branch: string | null;
  readonly head: string | null;
  readonly modifiedFiles: readonly string[];
  readonly untrackedFiles: readonly string[];
  readonly deletedFiles: readonly string[];
  readonly error?: string;
};

export type ObservationReadiness = {
  readonly state: string;
  readonly scopeViolations: readonly string[] | null;
  readonly protectedPathViolations: readonly string[] | null;
  readonly verifications: readonly { name: string; passed: boolean }[];
  readonly lastVerified: {
    readonly commit: string;
    readonly typeScript: "PASS" | "FAIL";
    readonly tests: "PASS" | "FAIL";
    readonly timestamp: string;
  } | null;
};

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort();
}

async function gitWorkingTree(projectDir: string): Promise<Omit<RepositoryObservation, "projectDir" | "files" | "error">> {
  const { stdout: statusOutput } = await execFileAsync("git", ["status", "--porcelain=v1", "--branch"], { cwd: projectDir });
  const [{ stdout: untrackedOutput }, head] = await Promise.all([
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: projectDir }),
    execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: projectDir })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null)
  ]);
  const lines = statusOutput.split("\n");
  const branch = lines.shift()?.replace(/^##\s*/, "").split("...")[0] || null;
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("??")) continue;
    const status = line.slice(0, 2);
    const path = line.slice(3);
    if (status.includes("D")) deletedFiles.push(path);
    else modifiedFiles.push(path);
  }

  return {
    branch,
    head,
    modifiedFiles: uniqueSorted(modifiedFiles),
    untrackedFiles: uniqueSorted(untrackedOutput.split("\n").filter(Boolean)),
    deletedFiles: uniqueSorted(deletedFiles)
  };
}

/**
 * A lightweight repository observer backed by Navi's existing Git-diff observation.
 * It indexes changed paths only; it does not perform semantic analysis.
 */
export class RepositoryObserver {
  async observe(projectDir: string): Promise<RepositoryObservation> {
    try {
      const [diff, workingTree] = await Promise.all([observeGitDiff(projectDir), gitWorkingTree(projectDir)]);
      return { projectDir, files: diff.changedFiles, ...workingTree, error: diff.error };
    } catch {
      return {
        projectDir,
        files: [],
        branch: null,
        head: null,
        modifiedFiles: [],
        untrackedFiles: [],
        deletedFiles: [],
        error: "Repository status could not be read. Ensure this is a Git working tree."
      };
    }
  }
}

function listed(paths: readonly string[], empty: string): string[] {
  return paths.length ? [...paths] : [empty];
}

function subsystems(paths: readonly string[]): string[] {
  const names = paths.map((path) => {
    const segments = path.split("/");
    if (segments[0] === "tests") return "Testing";
    if (path === "src/cli.ts") return "CLI";
    if (segments[0] === "src" && segments[1]) return segments[1].replace(/^./, (letter) => letter.toUpperCase());
    return segments[0]?.replace(/^./, (letter) => letter.toUpperCase()) || "Root";
  });
  return uniqueSorted(names);
}

export function repositoryObservationSnapshot(
  index: RepositoryObservation,
  readiness: ObservationReadiness
): Record<string, unknown> {
  const observedFiles = uniqueSorted([...index.modifiedFiles, ...index.untrackedFiles, ...index.deletedFiles]);
  const verificationRequired = !readiness.lastVerified
    || readiness.lastVerified.commit !== index.head
    || readiness.lastVerified.typeScript !== "PASS"
    || readiness.lastVerified.tests !== "PASS"
    || observedFiles.length > 0;
  const readyForValidation = !index.error
    && readiness.state === "AUTHORIZED"
    && readiness.scopeViolations?.length === 0
    && readiness.protectedPathViolations?.length === 0
    && readiness.verifications.every((verification) => verification.passed);

  return {
    currentRepository: {
      branch: index.branch,
      head: index.head,
      workingTree: {
        modified: index.modifiedFiles.length,
        deleted: index.deletedFiles.length,
        untracked: index.untrackedFiles.length
      },
      modifiedFiles: index.modifiedFiles,
      error: index.error
    },
    currentVerification: readiness.verifications,
    subsystems: subsystems(observedFiles),
    lastVerified: readiness.lastVerified,
    transition: {
      state: readiness.state,
      scopeViolations: readiness.scopeViolations,
      protectedPathViolations: readiness.protectedPathViolations,
      verificationRequired,
      readyForValidation
    }
  };
}

export function repositoryObservationReport(
  index: RepositoryObservation,
  readiness: ObservationReadiness
): string {
  const snapshot = repositoryObservationSnapshot(index, readiness);
  const transition = snapshot.transition as {
    scopeViolations: readonly string[] | null;
    protectedPathViolations: readonly string[] | null;
    verificationRequired: boolean;
    readyForValidation: boolean;
  };

  return [
    "NAVI OBSERVE",
    "",
    "CURRENT REPOSITORY",
    "──────────────────",
    `Branch: ${index.branch ?? "Not available"}`,
    `HEAD: ${index.head ?? "Not available"}`,
    "",
    "Working Tree",
    `Modified: ${index.modifiedFiles.length}`,
    `Untracked: ${index.untrackedFiles.length}`,
    `Deleted: ${index.deletedFiles.length}`,
    "",
    "CURRENT VERIFICATION",
    "────────────────────",
    ...readiness.verifications.map((verification) => `${verification.name}: ${verification.passed ? "PASS" : "FAIL"}`),
    "",
    "LAST VERIFIED CHECKPOINT",
    "────────────────────────",
    `Commit: ${readiness.lastVerified?.commit ?? "Not available"}`,
    `TypeScript: ${readiness.lastVerified?.typeScript ?? "Not available"}`,
    `Tests: ${readiness.lastVerified?.tests ?? "Not available"}`,
    `Timestamp: ${readiness.lastVerified?.timestamp ?? "Not available"}`,
    "",
    "TRANSITION STATUS",
    "─────────────────",
    `State: ${readiness.state}`,
    "",
    "Scope Violations:",
    ...(transition.scopeViolations === null ? ["Not checked"] : listed(transition.scopeViolations, "None")),
    "",
    "Protected Paths:",
    ...(transition.protectedPathViolations === null ? ["Not checked"] : listed(transition.protectedPathViolations, "None")),
    "",
    `Verification Required: ${transition.verificationRequired ? "YES" : "NO"}`,
    `Ready for Validation: ${transition.readyForValidation ? "YES" : "NO"}`
  ].join("\n");
}

export function repositoryObservationJson(index: RepositoryObservation, readiness: ObservationReadiness): string {
  return JSON.stringify(repositoryObservationSnapshot(index, readiness), null, 2);
}
