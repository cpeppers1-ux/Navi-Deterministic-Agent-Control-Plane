# Execution Runner Subsystem

The Execution Runner subsystem orchestrates the execution of exactly one bounded execution contract through a selected agent provider, immediately returning control to Navi for post-execution observation and validation.

## Closed-Loop Execution Workflow

1. **Pre-Execution Preparation**: Invokes `runNaviStart` to observe initial state, load/create active transition, construct bounded context, generate contract, and format provider request.
2. **Contract Execution**: Calls `adapter.execute(...)` to dispatch the single contract to the provider CLI process. Returns control immediately upon process completion.
3. **Post-Execution Observation**: Re-runs `RepositoryObserver` and `RepositoryIndexService` to index modified, untracked, and deleted paths resulting from agent execution.
4. **Context Regeneration**: Re-runs `buildContext` using post-execution index and active transition.
5. **Verification & Validation**: Executes `validateTransition` against post-execution changes and verification commands.
6. **Authorization Outcome**: Evaluates overall transition authorization (`authorized: boolean`).

## CLI Usage

```bash
navi run
navi run --agent claude
navi run --agent codex --json
```
