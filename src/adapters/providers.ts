import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VerificationResult } from "../core/validate.js";
import { runVerification } from "../core/validate.js";
import type { RepositoryIndex } from "./repository.js";

export type RepositorySymbol = {
  readonly name: string;
  readonly path: string;
  readonly kind: string;
};

/** Provides semantic symbols for an observed repository. */
export interface SymbolProvider {
  listSymbols(index: RepositoryIndex): Promise<readonly RepositorySymbol[]>;
}

/** Provides bounded text context for selected repository paths. */
export interface ContextProvider {
  getContext(index: RepositoryIndex, paths: readonly string[]): Promise<readonly string[]>;
}

/** Runs a verification command in the project directory. */
export interface VerificationProvider {
  verify(command: string, projectDir: string): Promise<VerificationResult>;
}

/** Returns empty symbols for an observed repository. */
export class EmptySymbolProvider implements SymbolProvider {
  async listSymbols(_index: RepositoryIndex): Promise<readonly RepositorySymbol[]> {
    return [];
  }
}

/** Returns empty text context for selected repository paths. */
export class EmptyContextProvider implements ContextProvider {
  async getContext(_index: RepositoryIndex, _paths: readonly string[]): Promise<readonly string[]> {
    return [];
  }
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Extracts deterministic source code symbols from an indexed repository. */
export class IndexSymbolProvider implements SymbolProvider {
  async listSymbols(index: RepositoryIndex): Promise<readonly RepositorySymbol[]> {
    const symbols: RepositorySymbol[] = [];

    for (const record of index.records) {
      try {
        const source = await readFile(join(index.projectDir, record.path), "utf8");
        const uncommented = withoutComments(source);
        const declarations = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
        const named = /^\s*export\s*{([^}]+)}/gm;
        const addedNames = new Set<string>();

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
      } catch {
        for (const name of record.exports) {
          symbols.push({ name, path: record.path, kind: "export" });
        }
      }
    }

    return symbols.sort((a, b) => (
      a.path.localeCompare(b.path) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind)
    ));
  }
}

/** Reads bounded text context for selected repository paths. */
export class FileContextProvider implements ContextProvider {
  async getContext(index: RepositoryIndex, paths: readonly string[]): Promise<readonly string[]> {
    const validPaths = new Set(index.records.map((record) => record.path));
    const targetPaths = paths.filter((path) => validPaths.has(path));
    const contexts: string[] = [];

    for (const path of targetPaths) {
      try {
        const content = await readFile(join(index.projectDir, path), "utf8");
        contexts.push(content);
      } catch {
        // Skip unreadable files
      }
    }

    return contexts;
  }
}

/** Delegates verification execution to Navi's existing implementation. */
export class ExistingVerificationProvider implements VerificationProvider {
  async verify(command: string, projectDir: string): Promise<VerificationResult> {
    return runVerification(command, projectDir);
  }
}
