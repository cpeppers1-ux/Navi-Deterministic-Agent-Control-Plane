import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeTextFile } from "../utils/files.js";

export type NaviState = {
  version: "0.1.0";
  destination: string;
  position: string;
  currentTurn: {
    id: number;
    task: string;
    scope: string[];
    acceptance: string[];
    doNotTouch: string[];
    verify: string[];
  };
  status: "AUTHORIZED";
  lastVerified?: {
    commit: string;
    typeScript: "PASS" | "FAIL";
    tests: "PASS" | "FAIL";
    timestamp: string;
  };
};

export const initialState = (): NaviState => ({
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

export const statePath = (projectDir: string): string => join(projectDir, ".navi", "state.json");

export async function initializeState(projectDir: string): Promise<{ created: boolean; path: string }> {
  const path = statePath(projectDir);
  try {
    await writeTextFile(path, `${JSON.stringify(initialState(), null, 2)}\n`, true);
    return { created: true, path };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { created: false, path };
    throw error;
  }
}

function isState(value: unknown): value is NaviState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const turn = state.currentTurn as Record<string, unknown> | undefined;
  const lastVerified = state.lastVerified as Record<string, unknown> | undefined;
  const isStringList = (item: unknown): item is string[] => Array.isArray(item) && item.every((entry) => typeof entry === "string");
  const isLastVerified = !lastVerified || (
    typeof lastVerified.commit === "string"
    && (lastVerified.typeScript === "PASS" || lastVerified.typeScript === "FAIL")
    && (lastVerified.tests === "PASS" || lastVerified.tests === "FAIL")
    && typeof lastVerified.timestamp === "string"
  );

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

export async function readState(projectDir: string): Promise<NaviState | null> {
  const path = statePath(projectDir);
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
    throw new Error("Navi state is not valid JSON.");
  }
  if (!isState(parsed)) throw new Error("Navi state does not match the expected schema.");
  return parsed;
}
