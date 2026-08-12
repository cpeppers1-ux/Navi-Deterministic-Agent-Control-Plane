import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import type { RepositoryIndex, RepositoryOutputRecord, RepositoryParser } from "./repository.js";

const ignoredDirectories = new Set([".git", ".navi", "coverage", "dist", "node_modules"]);
const sourceExtensions = new Set([
  ".c", ".cc", ".cpp", ".cs", ".cxx", ".go", ".h", ".hpp", ".java", ".js", ".jsx",
  ".mjs", ".php", ".py", ".rb", ".rs", ".ts", ".tsx"
]);

function isSourceFile(path: string): boolean {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return sourceExtensions.has(extension) && !/\.(?:generated|gen)\.[^.]+$/i.test(path);
}

async function sourcePaths(projectDir: string, currentDir = projectDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const path = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) paths.push(...await sourcePaths(projectDir, path));
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      paths.push(relative(projectDir, path).split(sep).join("/"));
    }
  }

  return paths.sort();
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Lightweight import extraction for common ESM and CommonJS source forms. */
export function extractImports(source: string): string[] {
  const imports: string[] = [];
  const esmFrom = /^\s*import\s+.+?\s+from\s+["']([^"']+)["']/gm;
  const esmBare = /^\s*import\s*["']([^"']+)["']/gm;
  const commonJs = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of withoutComments(source).matchAll(esmFrom)) imports.push(match[1]);
  for (const match of withoutComments(source).matchAll(esmBare)) imports.push(match[1]);
  for (const match of withoutComments(source).matchAll(commonJs)) imports.push(match[1]);
  return imports;
}

/** Lightweight export extraction for common ESM source forms. */
export function extractExports(source: string): string[] {
  const exports: string[] = [];
  const declarations = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const named = /^\s*export\s*{([^}]+)}/gm;
  const uncommented = withoutComments(source);

  for (const match of uncommented.matchAll(declarations)) exports.push(match[1]);
  for (const match of uncommented.matchAll(named)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/).at(-1)?.trim();
      if (name) exports.push(name);
    }
  }
  if (/^\s*export\s+default\b/m.test(uncommented) && !exports.includes("default")) exports.push("default");
  return [...new Set(exports)];
}

export function subsystemForPath(relativePath: string): string {
  const segments = relativePath.split("/");
  if (segments[0] === "src") {
    if (segments.length > 2) return segments[1];
    return segments[1]?.replace(/\.[^.]+$/, "") || "unknown";
  }
  return segments.length > 1 ? segments[0] : "unknown";
}

function withoutExtension(path: string): string {
  return path.replace(/\.[^.\/]+$/, "");
}

function importedPath(importer: RepositoryOutputRecord, specifier: string, records: readonly RepositoryOutputRecord[]): string | null {
  if (!specifier.startsWith(".")) return null;
  const requestedPath = posix.normalize(posix.join(posix.dirname(importer.path), specifier));
  const requestedBase = withoutExtension(requestedPath);
  return records.find((record) => (
    record.path === requestedPath
    || withoutExtension(record.path) === requestedBase
    || withoutExtension(record.path).replace(/\/index$/, "") === requestedBase
  ))?.path ?? null;
}

function withImportedBy(records: readonly RepositoryOutputRecord[]): RepositoryOutputRecord[] {
  const importers = new Map(records.map((record) => [record.path, new Set<string>()]));

  for (const record of records) {
    for (const specifier of record.imports) {
      const target = importedPath(record, specifier, records);
      if (target) importers.get(target)?.add(record.path);
    }
  }

  return records.map((record) => ({
    ...record,
    importedBy: [...(importers.get(record.path) ?? [])].sort()
  }));
}

/**
 * Builds an in-memory index of repository source files. This is deliberately a
 * directory and text-based observer; it does not parse language syntax trees.
 */
export class RepositoryIndexService implements RepositoryParser {
  async parse(projectDir: string): Promise<RepositoryIndex> {
    const paths = await sourcePaths(projectDir);
    const files = await Promise.all(paths.map((relativePath) => this.indexFile(projectDir, relativePath)));
    return { projectDir, records: withImportedBy(files) };
  }

  private async indexFile(projectDir: string, relativePath: string): Promise<RepositoryOutputRecord> {
    const source = await readFile(join(projectDir, relativePath), "utf8");
    return {
      path: relativePath,
      imports: extractImports(source),
      importedBy: [],
      exports: extractExports(source),
      subsystem: subsystemForPath(relativePath)
    };
  }
}

export async function repositoryOutputRecords(projectDir: string): Promise<readonly RepositoryOutputRecord[]> {
  return (await new RepositoryIndexService().parse(projectDir)).records;
}
