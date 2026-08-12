import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const defaultExecutor = async (command, args, options) => {
    const start = Date.now();
    try {
        const { stdout, stderr } = await execFileAsync(command, [...args], {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env
        });
        return {
            exitCode: 0,
            stdout: String(stdout),
            stderr: String(stderr),
            passed: true,
            durationMs: Date.now() - start
        };
    }
    catch (error) {
        return {
            exitCode: typeof error?.code === "number" ? error.code : 1,
            stdout: error?.stdout ? String(error.stdout) : "",
            stderr: error?.stderr ? String(error.stderr) : String(error?.message ?? "Execution failed"),
            passed: false,
            durationMs: Date.now() - start
        };
    }
};
const defaultDetector = async () => ({ available: true, version: "0.1.0" });
export class GeminiCliAdapter {
    detector;
    executor;
    agentType = "gemini";
    constructor(detector = defaultDetector, executor = defaultExecutor) {
        this.detector = detector;
        this.executor = executor;
    }
    async detectCapabilities(config) {
        const exec = config?.executablePath ?? "gemini";
        const res = await this.detector(exec);
        return {
            available: res.available,
            supportsContext: true,
            supportsTokenSaver: true,
            maxContextTokens: 128000,
            version: res.version
        };
    }
    validateConfig(config) {
        const errors = [];
        if (config.agent !== "gemini")
            errors.push("Config agent type must be 'gemini'.");
        return { valid: errors.length === 0, errors };
    }
    formatRequest(request, config) {
        const exec = config?.executablePath ?? "gemini";
        const model = config?.model ?? "gemini-2.5-pro";
        const prompt = [
            `TASK: ${request.task}`,
            "",
            "--- EXECUTION CONTRACT ---",
            request.contract,
            "",
            "--- BOUNDED CONTEXT ---",
            `Primary Files: ${request.context.primaryFiles.join(", ") || "None"}`,
            `Dependency Neighborhood: ${request.context.dependencyNeighborhood.join(", ") || "None"}`
        ].join("\n");
        return {
            agent: "gemini",
            commandLine: [exec, "--model", model, "--prompt", prompt],
            prompt,
            environment: config?.environment
        };
    }
    async execute(request, options) {
        const [cmd, ...args] = request.commandLine;
        return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
    }
}
export class CodexCliAdapter {
    detector;
    executor;
    agentType = "codex";
    constructor(detector = defaultDetector, executor = defaultExecutor) {
        this.detector = detector;
        this.executor = executor;
    }
    async detectCapabilities(config) {
        const exec = config?.executablePath ?? "codex";
        const res = await this.detector(exec);
        return {
            available: res.available,
            supportsContext: true,
            supportsTokenSaver: false,
            maxContextTokens: 64000,
            version: res.version
        };
    }
    validateConfig(config) {
        const errors = [];
        if (config.agent !== "codex")
            errors.push("Config agent type must be 'codex'.");
        return { valid: errors.length === 0, errors };
    }
    formatRequest(request, config) {
        const exec = config?.executablePath ?? "codex";
        const model = config?.model ?? "codex-v1";
        const prompt = [
            `TASK: ${request.task}`,
            "",
            "--- CONTRACT ---",
            request.contract
        ].join("\n");
        return {
            agent: "codex",
            commandLine: [exec, "exec", "--model", model, "--input", prompt],
            prompt,
            environment: config?.environment
        };
    }
    async execute(request, options) {
        const [cmd, ...args] = request.commandLine;
        return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
    }
}
export class ClaudeCodeAdapter {
    detector;
    executor;
    agentType = "claude";
    constructor(detector = defaultDetector, executor = defaultExecutor) {
        this.detector = detector;
        this.executor = executor;
    }
    async detectCapabilities(config) {
        const exec = config?.executablePath ?? "claude";
        const res = await this.detector(exec);
        return {
            available: res.available,
            supportsContext: true,
            supportsTokenSaver: true,
            maxContextTokens: 200000,
            version: res.version
        };
    }
    validateConfig(config) {
        const errors = [];
        if (config.agent !== "claude")
            errors.push("Config agent type must be 'claude'.");
        return { valid: errors.length === 0, errors };
    }
    formatRequest(request, config) {
        const exec = config?.executablePath ?? "claude";
        const model = config?.model ?? "claude-3-5-sonnet";
        const prompt = [
            `TASK: ${request.task}`,
            "",
            "--- EXECUTION CONTRACT ---",
            request.contract,
            "",
            "--- CONTEXT ---",
            `Primary Files: ${request.context.primaryFiles.join(", ") || "None"}`
        ].join("\n");
        return {
            agent: "claude",
            commandLine: [exec, "--print", "-m", model, prompt],
            prompt,
            environment: config?.environment
        };
    }
    async execute(request, options) {
        const [cmd, ...args] = request.commandLine;
        return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
    }
}
export function getAgentAdapter(agentType = "gemini", detector, executor) {
    switch (agentType.toLowerCase()) {
        case "codex":
            return new CodexCliAdapter(detector, executor);
        case "claude":
            return new ClaudeCodeAdapter(detector, executor);
        case "gemini":
        default:
            return new GeminiCliAdapter(detector, executor);
    }
}
