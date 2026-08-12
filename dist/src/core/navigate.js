const defined = (value) => value.trim() || "Not defined.";
const items = (value, empty) => value.length ? value.map((item) => `- ${item}`).join("\n") : empty;
export function navigationContract(state) {
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
