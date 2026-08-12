# Start Workflow Orchestration

The `navi start` command serves as the single deterministic entry point for Navi, orchestrating repository observation, context building, transition management, and verification.

## Orchestration Flow

1. **State Check**: Reads `.navi/state.json`. Ensures the workspace is initialized.
2. **Repository Observation**: Runs `RepositoryObserver` and `RepositoryIndexService` to observe changed files, branch info, git status, and structural index.
3. **Transition Management**: Loads active transition from `.navi/transitions/transition-<id>.json` or creates/persists a new `NaviTransition` from active turn state.
4. **Bounded Context Construction**: Executes `buildContext` using the index and active transition to generate primary files, dependency neighborhood, and token metrics.
5. **Execution Contract Generation**: Produces the execution contract via `navigationContract`.
6. **Verification & Rule Validation**: Runs `validateTransition` to evaluate scope violations, protected path violations, and verification commands.
7. **Transition Authorization**: Evaluates whether the turn transition is authorized based on clean repository observation, authorization status, and clean verification.

## CLI Usage

```bash
navi start
navi start --json
```
