# Agent Adapters Subsystem

The Agent Adapter subsystem provides a provider-agnostic boundary between Navi's deterministic orchestration and external coding agents (Gemini CLI, Codex CLI, and Claude Code).

## Core Concepts

- **`AgentRunner` Interface**: Defines the provider-agnostic adapter contract.
  - `detectCapabilities(config?)`: Asynchronously evaluates executable availability and agent capability boundaries (max tokens, token saver support).
  - `validateConfig(config)`: Validates agent configuration and parameters.
  - `formatRequest(request, config?)`: Formats the canonical command-line invocation and prompt payload.
- **Adapters**:
  - `GeminiCliAdapter`: Formats requests for Gemini CLI (`gemini --model ... --prompt ...`).
  - `CodexCliAdapter`: Formats requests for Codex CLI (`codex exec --model ... --input ...`).
  - `ClaudeCodeAdapter`: Formats requests for Claude Code (`claude --print -m ... ...`).
- **`getAgentAdapter(agentType, detector?)`**: Factory returning the matching adapter instance.

## Process Execution Boundary

Adapters construct canonical requests and detect capabilities using dependency injection without executing external process commands directly.
