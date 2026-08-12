import type { NaviState } from "./state.js";

const defined = (value: string): string => value.trim() || "Not defined.";
const items = (value: string[], empty: string): string => value.length ? value.map((item) => `- ${item}`).join("\n") : empty;

export function navigationContract(state: NaviState): string {
  return [
    `NAVI // TURN ${state.currentTurn.id}`,
    "",
    "POSITION",
    defined(state.position),
    "",
    "DESTINATION",
    defined(state.destination),
    "",
    "TASK",
    defined(state.currentTurn.task),
    "",
    "SCOPE",
    items(state.currentTurn.scope, "None specified."),
    "",
    "ACCEPTANCE",
    items(state.currentTurn.acceptance, "None specified."),
    "",
    "DO NOT TOUCH",
    items(state.currentTurn.doNotTouch, "None specified."),
    "",
    "VERIFY",
    items(state.currentTurn.verify, "None specified."),
    "",
    "EXECUTE."
  ].join("\n");
}
