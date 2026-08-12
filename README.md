```markdown
# Navi

> **A deterministic repository control plane for autonomous software changes.**
> 
> *Give your coding agent a kitchen, not the whole house.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

---

## Overview

**Navi** is a lightweight, local control plane that constrains, observes, verifies, and authorizes repository state transitions produced by autonomous AI agents (Claude, Gemini, Codex, local LLMs).

Rather than relying on "soft governance" (asking an LLM in its system prompt to behave), Navi enforces **hard runtime boundaries** at the filesystem and Git layer. Agents operate inside ephemeral worktrees with strictly bounded file permissions, deterministic verification gates, and cryptographic candidate identity binding.

Navi does not evaluate whether code is "elegant"—it deterministically proves whether candidate repository state satisfies its transition contract before allowing promotion to main.


```

```
                     USER
                      │
                 desired outcome
                      │
                      ▼
             ┌─────────────────┐
             │      NAVI       │
             │ CONTROL PLANE   │
             │                 │
             │ Contract        │
             │ Scope           │
             │ Context         │
             └────────┬────────┘
                      │
               bounded request
                      │
                      ▼
             ┌─────────────────┐
             │ EXECUTION PLANE │
             │                 │
             │ Worktree        │
             │ Agent Adapter   │
             └────────┬────────┘
                      │
                 candidate H
                      │
                      ▼
             ┌─────────────────┐
             │   NAVI GUARD    │
             │                 │
             │ scope           │
             │ contract        │
             │ invariants      │
             └────────┬────────┘
                      │
                 PASS / FAIL
                      │
                      ▼
             ┌─────────────────┐
             │ NAVI AUTHORITY  │
             │                 │
             │ authorize H     │
             └────────┬────────┘
                      │
                promotion gate
                      │
                      ▼
                AUTHORITATIVE
                REPOSITORY

```

```

---

## Core Invariants

1. **No Unverified State Promotion:** No candidate state becomes authoritative merely because an agent claims it succeeded.
2. **Immutable Transition Contracts:** Transition contracts are content-addressed (SHA-256) and cannot be modified by the agent during execution.
3. **Cryptographic Identity Binding:** Validation applies to a unique candidate commit hash ($H$). Promotion is strictly restricted to $H$; any TOCTOU mutation ($H_2$) instantly invalidates authority.
4. **Model Independence:** The reasoning model can change; the execution boundary remain deterministic.

---

## Features

- **Ephemeral Worktree Isolation:** Executes agent work in isolated, temporary Git scratch trees without altering your working tree or main branch.
- **Contract & Scope Enforcement:** Defines exact wildcard paths an agent may touch (`allowed_paths`) and explicit paths it cannot touch (`protected_paths`).
- **Deterministic Guard Gates:** Runs system assertions (compilation, unit tests, custom linters) and checks file mutation diffs prior to authority approval.
- **Checkpoint & Evidence Subsystem:** Records verifiable, content-addressed snapshots of repository state history with complete proof logs.
- **Zero-Friction UX:** Single CLI entrypoint (`navi start`) handles context isolation, execution execution, validation, and promotion.

---

## Quick Start

### Installation

```bash
npm install -g navi-control-plane

```

### Basic Usage

Start a bounded task for your local agent:

```bash
navi start "Implement rate limiting for auth routes"

```

Navi automatically:

1. Synthesizes a transition contract (`T-042`).
2. Isolates the agent inside an ephemeral worktree (`.navi/scratch/T-042`).
3. Passes bounded context (imports/exports neighborhood) to the agent.
4. Runs `navi guard` post-execution to verify scope, tests, and invariants.
5. Emits a candidate identity hash ($H$) ready for authorization.

---

## CLI Reference

| Command | Description |
| --- | --- |
| `navi start <prompt>` | Primary entrypoint: builds contract, provisions worktree, runs agent, and validates result. |
| `navi observe` | Outputs control-plane status of current repository, invariants, and scope violations. |
| `navi validate` | Manually triggers Navi Guard predicates against a candidate worktree. |
| `navi checkpoint` | Lists, compares, or restores machine-recorded known-good repository states. |
| `navi promote` | Authorizes candidate commit $H$ and merges it into the authoritative branch. |

---

## The Four-Way Separation of Concerns

Navi enforces strict separation between reasoning, execution, validation, and authority:

| Responsibility | Layer | Core Question |
| --- | --- | --- |
| **Reasoning** | Agent (Claude / Gemini / Codex) | *How should this be done?* |
| **Execution** | Runtime / Worktree | *Where is it performed?* |
| **Validation** | Navi Guard | *Does candidate state $H$ satisfy the contract?* |
| **Authority** | Navi Control Plane | *May state $H$ become authoritative?* |

---

## Adversarial Benchmark Suite

Navi includes a comprehensive security and boundary test suite to verify control-plane integrity against rogue or misaligned agent behaviors:

```bash
npm run test:adversarial

```

### Test Coverage

* **ATTACK-01 (Boundary Breach):** Agent attempts to mutate protected path (`.navi/**` or `package.json`).
* **ATTACK-02 (Contract Tampering):** Agent attempts to modify transition contract JSON to widen scope.
* **ATTACK-03 (TOCTOU / State Mutation):** Agent mutates code state between validation check and promotion gate.
* **ATTACK-04 (Test Suite Bypass):** Agent alters test assertions or introduces `test.skip()`.

---

## Architecture & Design Principles

For a detailed breakdown of Navi's conceptual framework, transition primitives, and security boundaries, read the full [Architecture Specification](https://www.google.com/search?q=docs/ARCHITECTURE.md).

---

## License

[MIT](https://www.google.com/search?q=LICENSE) © Navi Contributors
