import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runVerification } from "../core/validate.js";
/** Returns empty symbols for an observed repository. */
export class EmptySymbolProvider {
    async listSymbols(_index) {
        return [];
    }
}
/** Returns empty text context for selected repository paths. */
export class EmptyContextProvider {
    async getContext(_index, _paths) {
        return [];
    }
}
function withoutComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
/** Extracts deterministic source code symbols from an indexed repository. */
export class IndexSymbolProvider {
    async listSymbols(index) {
        const symbols = [];
        for (const record of index.records) {
            try {
                const source = await readFile(join(index.projectDir, record.path), "utf8");
                const uncommented = withoutComments(source);
                const declarations = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
                const named = /^\s*export\s*{([^}]+)}/gm;
                const addedNames = new Set();
                for (const match of uncommented.matchAll(declarations)) {
                    const kind = match[1];
                    const name = match[2];
                    symbols.push({ name, path: record.path, kind });
                    addedNames.add(name);
                }
                for (const match of uncommented.matchAll(named)) {
                    for (const entry of match[1].split(",")) {
                        const name = entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)?.trim();
                        if (name && !addedNames.has(name)) {
                            symbols.push({ name, path: record.path, kind: "export" });
                            addedNames.add(name);
                        }
                    }
                }
                if (/^\s*export\s+default\b/m.test(uncommented) && !addedNames.has("default")) {
                    symbols.push({ name: "default", path: record.path, kind: "default" });
                    addedNames.add("default");
                }
            }
            catch {
                for (const name of record.exports) {
                    symbols.push({ name, path: record.path, kind: "export" });
                }
            }
        }
        return symbols.sort((a, b) => (a.path.localeCompare(b.path) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)));
    }
}
/** Reads bounded text context for selected repository paths. */
export class FileContextProvider {
    async getContext(index, paths) {
        const validPaths = new Set(index.records.map((record) => record.path));
        const targetPaths = paths.filter((path) => validPaths.has(path));
        const contexts = [];
        for (const path of targetPaths) {
            try {
                const content = await readFile(join(index.projectDir, path), "utf8");
                contexts.push(content);
            }
            catch {
                // Skip unreadable files
            }
        }
        return contexts;
    }
}
/** Delegates verification execution to Navi's existing implementation. */
export class ExistingVerificationProvider {
    async verify(command, projectDir) {
        return runVerification(command, projectDir);
    }
}
