function pathInScope(path, scope) {
    const boundary = scope.replace(/^\.\//, "").replace(/\/+$/, "");
    return path === boundary || path.startsWith(`${boundary}/`);
}
function estimateTokens(value) {
    return Math.ceil(JSON.stringify(value).length / 4);
}
function neighborhood(records, primaryPaths) {
    const paths = new Set();
    for (const record of records) {
        if (primaryPaths.has(record.path)) {
            for (const importer of record.importedBy)
                paths.add(importer);
        }
        if (record.importedBy.some((importer) => primaryPaths.has(importer)))
            paths.add(record.path);
    }
    for (const path of primaryPaths)
        paths.delete(path);
    return [...paths].sort();
}
function extractSource(target) {
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
export function buildContext(index, source) {
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
function listed(values, empty) {
    return values.length ? values.map((value) => `- ${value}`) : [empty];
}
export function contextReport(context) {
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
export function contextJson(context) {
    return JSON.stringify(context, null, 2);
}
