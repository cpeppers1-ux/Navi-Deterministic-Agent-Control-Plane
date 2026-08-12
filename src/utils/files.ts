import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeTextFile(path: string, contents: string, exclusive = false): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, { encoding: "utf8", flag: exclusive ? "wx" : "w" });
}
