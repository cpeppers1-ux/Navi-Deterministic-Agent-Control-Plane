import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
function changedPaths(output) {
    return output.split("\n").map((path) => path.trim()).filter(Boolean);
}
export async function observeGitDiff(projectDir) {
    try {
        const [unstaged, staged] = await Promise.all([
            execFileAsync("git", ["diff", "--name-only", "--no-renames"], { cwd: projectDir }),
            execFileAsync("git", ["diff", "--cached", "--name-only", "--no-renames"], { cwd: projectDir })
        ]);
        return { changedFiles: [...new Set([...changedPaths(unstaged.stdout), ...changedPaths(staged.stdout)])].sort() };
    }
    catch {
        return { changedFiles: [], error: "Git diff could not be read. Ensure this is a Git working tree." };
    }
}
export async function runVerification(command, projectDir) {
    try {
        const { stdout, stderr } = await execAsync(command, { cwd: projectDir, maxBuffer: 1024 * 1024 });
        return { command, passed: true, output: `${stdout}${stderr}`.trim() };
    }
    catch (error) {
        const processError = error;
        return {
            command,
            passed: false,
            output: `${processError.stdout ?? ""}${processError.stderr ?? ""}`.trim()
        };
    }
}
function normalisePath(path) {
    return path.replace(/^\.\//, "").replace(/\/+$/, "");
}
function matchesPath(path, rule) {
    const target = normalisePath(path);
    const boundary = normalisePath(rule);
    return target === boundary || target.startsWith(`${boundary}/`);
}
export function findScopeViolations(changedFiles, scope) {
    if (scope.length === 0)
        return [];
    return changedFiles.filter((path) => !scope.some((allowed) => matchesPath(path, allowed)));
}
export function findDoNotTouchViolations(changedFiles, doNotTouch) {
    return changedFiles.filter((path) => doNotTouch.some((protectedPath) => matchesPath(path, protectedPath)));
}
const defaultDependencies = { observeGitDiff, runVerification };
export async function validateState(projectDir, state, dependencies = defaultDependencies) {
    const git = await dependencies.observeGitDiff(projectDir);
    const [scopeViolations, doNotTouchViolations, verifications] = await Promise.all([
        Promise.resolve(findScopeViolations(git.changedFiles, state.currentTurn.scope)),
        Promise.resolve(findDoNotTouchViolations(git.changedFiles, state.currentTurn.doNotTouch)),
        Promise.all(state.currentTurn.verify.map((command) => dependencies.runVerification(command, projectDir)))
    ]);
    return {
        git,
        scopeViolations,
        doNotTouchViolations,
        verifications,
        passed: !git.error
            && scopeViolations.length === 0
            && doNotTouchViolations.length === 0
            && verifications.every((verification) => verification.passed)
    };
}
function listed(paths, empty) {
    return paths.length ? paths.map((path) => `- ${path}`) : [empty];
}
export function validationReport(result) {
    return [
        "NAVI VALIDATE",
        "",
        "GIT DIFF",
        ...(result.git.error ? [result.git.error] : listed(result.git.changedFiles, "No changed files.")),
        "",
        "SCOPE",
        ...listed(result.scopeViolations, "No scope violations."),
        "",
        "DO NOT TOUCH",
        ...listed(result.doNotTouchViolations, "No protected-path violations."),
        "",
        "VERIFY",
        ...(result.verifications.length
            ? result.verifications.map((verification) => `- ${verification.passed ? "PASS" : "FAIL"}: ${verification.command}`)
            : ["No verification commands specified."]),
        "",
        `RESULT: ${result.passed ? "PASS" : "FAIL"}`
    ].join("\n");
}
