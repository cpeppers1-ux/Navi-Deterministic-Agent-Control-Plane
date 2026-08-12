import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NaviContext } from "../core/context.js";
import type { NaviTransition } from "../core/transition.js";

const execFileAsync = promisify(execFile);

export type AgentType = "gemini" | "codex" | "claude";

export type AgentCapabilities = {
  readonly available: boolean;
  readonly supportsContext: boolean;
  readonly supportsTokenSaver: boolean;
  readonly maxContextTokens?: number;
  readonly version?: string;
};

export type AgentConfig = {
  readonly agent: AgentType;
  readonly executablePath?: string;
  readonly model?: string;
  readonly environment?: Record<string, string>;
};

export type AgentExecutionRequest = {
  readonly contract: string;
  readonly task: string;
  readonly context: NaviContext;
  readonly transition: NaviTransition;
};

export type FormattedAgentRequest = {
  readonly agent: AgentType;
  readonly commandLine: readonly string[];
  readonly prompt: string;
  readonly environment?: Record<string, string>;
};

export type AgentExecutionResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly passed: boolean;
  readonly durationMs: number;
};

export type AgentExecutor = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: Record<string, string> }
) => Promise<AgentExecutionResult>;

const defaultExecutor: AgentExecutor = async (command, args, options) => {
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
  } catch (error: any) {
    return {
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stdout: error?.stdout ? String(error.stdout) : "",
      stderr: error?.stderr ? String(error.stderr) : String(error?.message ?? "Execution failed"),
      passed: false,
      durationMs: Date.now() - start
    };
  }
};

export interface AgentRunner {
  readonly agentType: AgentType;
  detectCapabilities(config?: AgentConfig): Promise<AgentCapabilities>;
  validateConfig(config: AgentConfig): { readonly valid: boolean; readonly errors: readonly string[] };
  formatRequest(request: AgentExecutionRequest, config?: AgentConfig): FormattedAgentRequest;
  execute(request: FormattedAgentRequest, options: { cwd: string }): Promise<AgentExecutionResult>;
}

export type CapabilityDetector = (executable: string) => Promise<{ available: boolean; version?: string }>;

const defaultDetector: CapabilityDetector = async () => ({ available: true, version: "0.1.0" });

export class GeminiCliAdapter implements AgentRunner {
  readonly agentType: AgentType = "gemini";
  constructor(
    private readonly detector: CapabilityDetector = defaultDetector,
    private readonly executor: AgentExecutor = defaultExecutor
  ) {}

  async detectCapabilities(config?: AgentConfig): Promise<AgentCapabilities> {
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

  validateConfig(config: AgentConfig): { valid: boolean; errors: readonly string[] } {
    const errors: string[] = [];
    if (config.agent !== "gemini") errors.push("Config agent type must be 'gemini'.");
    return { valid: errors.length === 0, errors };
  }

  formatRequest(request: AgentExecutionRequest, config?: AgentConfig): FormattedAgentRequest {
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

  async execute(request: FormattedAgentRequest, options: { cwd: string }): Promise<AgentExecutionResult> {
    const [cmd, ...args] = request.commandLine;
    return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
  }
}

export class CodexCliAdapter implements AgentRunner {
  readonly agentType: AgentType = "codex";
  constructor(
    private readonly detector: CapabilityDetector = defaultDetector,
    private readonly executor: AgentExecutor = defaultExecutor
  ) {}

  async detectCapabilities(config?: AgentConfig): Promise<AgentCapabilities> {
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

  validateConfig(config: AgentConfig): { valid: boolean; errors: readonly string[] } {
    const errors: string[] = [];
    if (config.agent !== "codex") errors.push("Config agent type must be 'codex'.");
    return { valid: errors.length === 0, errors };
  }

  formatRequest(request: AgentExecutionRequest, config?: AgentConfig): FormattedAgentRequest {
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

  async execute(request: FormattedAgentRequest, options: { cwd: string }): Promise<AgentExecutionResult> {
    const [cmd, ...args] = request.commandLine;
    return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
  }
}

export class ClaudeCodeAdapter implements AgentRunner {
  readonly agentType: AgentType = "claude";
  constructor(
    private readonly detector: CapabilityDetector = defaultDetector,
    private readonly executor: AgentExecutor = defaultExecutor
  ) {}

  async detectCapabilities(config?: AgentConfig): Promise<AgentCapabilities> {
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

  validateConfig(config: AgentConfig): { valid: boolean; errors: readonly string[] } {
    const errors: string[] = [];
    if (config.agent !== "claude") errors.push("Config agent type must be 'claude'.");
    return { valid: errors.length === 0, errors };
  }

  formatRequest(request: AgentExecutionRequest, config?: AgentConfig): FormattedAgentRequest {
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

  async execute(request: FormattedAgentRequest, options: { cwd: string }): Promise<AgentExecutionResult> {
    const [cmd, ...args] = request.commandLine;
    return this.executor(cmd, args, { cwd: options.cwd, env: request.environment });
  }
}

export function getAgentAdapter(
  agentType: AgentType | string = "gemini",
  detector?: CapabilityDetector,
  executor?: AgentExecutor
): AgentRunner {
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
