import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export async function writeTextFile(path, contents, exclusive = false) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, { encoding: "utf8", flag: exclusive ? "wx" : "w" });
}
