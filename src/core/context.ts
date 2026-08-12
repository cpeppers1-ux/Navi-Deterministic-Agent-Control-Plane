import type { RepositoryIndex, RepositoryOutputRecord } from "../adapters/repository.js";
import type { NaviState } from "./state.js";
import type { NaviTransition } from "./transition.js";

export type NaviContext = {
  readonly currentTask: string;
  readonly allowedScope: readonly string[];
  readonly primaryFiles: readonly string[];
  readonly dependencyNeighborhood: readonly string[];
  readonly exports: readonly { path: string; names: readonly string[] }[];
  readonly verificationCommands: readonly string[];
  readonly estimatedContextTokens: number;
  readonly tokenSaver: {
    readonly indexedFiles: number;
    readonly selectedFiles: number;
    readonly omittedFiles: number;
    readonly estimatedTokensSaved: number;
  };
};

function pathInScope(path: string, scope: string): boolean {
  const boundary = scope.replace(/^\.\//, "").replace(/\/+$/, "");
  return path === boundary || path.startsWith(`${boundary}/`);
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function neighborhood(records: readonly RepositoryOutputRecord[], primaryPaths: ReadonlySet<string>): string[] {
  const paths = new Set<string>();
  for (const record of records) {
    if (primaryPaths.has(record.path)) {
      for (const importer of record.importedBy) paths.add(importer);
    }
    if (record.importedBy.some((importer) => primaryPaths.has(importer))) paths.add(record.path);
  }
  for (const path of primaryPaths) paths.delete(path);
  return [...paths].sort();
}

type ContextSource = {
  task: string;
  scope: readonly string[];
  verify: readonly string[];
};

function extractSource(target: NaviState | NaviTransition): ContextSource {
  if ("currentTurn" in target) {
    return {
      task: target.currentTurn.task,
      scope: target.currentTurn.scope,
      verify: target.currentTurn.verify
    };
  }
  return {
    task: target.task,
    scope: target.scope,
    verify: target.verify
  };
}

/** Builds the smallest deterministic structural context for the current turn or transition. */
export function buildContext(index: RepositoryIndex, source: NaviState | NaviTransition): NaviContext {
  const { task, scope, verify } = extractSource(source);
  const primaryRecords = scope.length === 0
    ? []
    : index.records.filter((record) => scope.some((allowed) => pathInScope(record.path, allowed)));
  const primaryFiles = primaryRecords.map((record) => record.path);
  const dependencyNeighborhood = neighborhood(index.records, new Set(primaryFiles));
  const selectedPaths = new Set([...primaryFiles, ...dependencyNeighborhood]);
  const selectedRecords = index.records.filter((record) => selectedPaths.has(record.path));
  const exports = selectedRecords
    .filter((record) => record.exports.length > 0)
    .map((record) => ({ path: record.path, names: record.exports }));
  const contextPayload = {
    currentTask: task,
    allowedScope: scope,
    records: selectedRecords,
    verificationCommands: verify
  };
  const allRecordsPayload = { ...contextPayload, records: index.records };
  const estimatedContextTokens = estimateTokens(contextPayload);
  const totalRepositoryTokens = estimateTokens(allRecordsPayload);

  return {
    currentTask: task,
    allowedScope: scope,
    primaryFiles,
    dependencyNeighborhood,
    exports,
    verificationCommands: verify,
    estimatedContextTokens,
    tokenSaver: {
      indexedFiles: index.records.length,
      selectedFiles: selectedRecords.length,
      omittedFiles: index.records.length - selectedRecords.length,
      estimatedTokensSaved: Math.max(0, totalRepositoryTokens - estimatedContextTokens)
    }
  };
}

function listed(values: readonly string[], empty: string): string[] {
  return values.length ? values.map((value) => `- ${value}`) : [empty];
}

export function contextReport(context: NaviContext): string {
  return [
    "NAVI CONTEXT",
    "",
    "Current Task",
    "-------------",
    context.currentTask || "Not defined.",
    "",
    "Allowed Scope",
    "--------------",
    ...listed(context.allowedScope, "None specified."),
    "",
    "Primary Files",
    "-------------",
    ...listed(context.primaryFiles, "None selected."),
    "",
    "Dependency Neighborhood",
    "-----------------------",
    ...listed(context.dependencyNeighborhood, "None selected."),
    "",
    "Exports",
    "-------",
    ...(context.exports.length
      ? context.exports.map((record) => `- ${record.path}: ${record.names.join(", ")}`)
      : ["None selected."]),
    "",
    "Verification Commands",
    "---------------------",
    ...listed(context.verificationCommands, "None specified."),
    "",
    "Estimated Context Tokens",
    "------------------------",
    String(context.estimatedContextTokens),
    "",
    "NAVI TOKEN SAVER",
    "----------------",
    `Indexed files: ${context.tokenSaver.indexedFiles}`,
    `Selected files: ${context.tokenSaver.selectedFiles}`,
    `Files omitted: ${context.tokenSaver.omittedFiles}`,
    `Estimated tokens saved: ${context.tokenSaver.estimatedTokensSaved}`
  ].join("\n");
}

export function contextJson(context: NaviContext): string {
  return JSON.stringify(context, null, 2);
}
