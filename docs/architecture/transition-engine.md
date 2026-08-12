# Transition Engine

The Transition Engine defines and validates bounded repository state transitions.

## Overview

A `NaviTransition` captures the contract for a single state transition turn. It specifies:
- `id`: Unique turn identifier matching state turn ID.
- `task`: High-level goal or description of the transition.
- `scope`: Bounded allowed file paths or directories.
- `acceptance`: Acceptance criteria for completing the transition.
- `doNotTouch`: Protected paths that must not be mutated during the transition.
- `verify`: Mandatory verification commands to run for transition validation.
- `status`: Transition state (`PROPOSED`, `AUTHORIZED`, `VALIDATED`, `REJECTED`).
- `timestamp`: Timestamp of transition creation.
- `positionBefore` and `positionAfter`: Prior state position and targeted destination.

## Storage and Lifecycle

Transitions are persisted in `.navi/transitions/transition-<id>.json`.

- `createTransition(state, overrides)`: Creates a new transition from state.
- `saveTransition(projectDir, transition)`: Persists transition to disk.
- `loadTransition(projectDir, id)`: Loads and schema-validates a transition.
- `listTransitions(projectDir)`: Lists all transition records in sequence.
- `validateTransition(projectDir, transition, dependencies)`: Validates git modifications against scope and protected paths, and executes verification commands.

## Context Builder Integration

`buildContext(index, source)` accepts either `NaviState` or `NaviTransition` as its source, allowing the Context Builder to generate bounded structural context directly from active transition bounds.

## CLI Commands

- `navi transition`: Formats and displays the current turn's active transition.
- `navi transition create` / `navi transition propose`: Generates and persists a transition file.
- `navi transition validate`: Validates transition rules and verification commands.
