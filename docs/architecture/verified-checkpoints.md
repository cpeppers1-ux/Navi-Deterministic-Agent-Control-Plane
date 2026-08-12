# Verified Checkpoints

A `NaviCheckpoint` is an immutable, persisted record of the last known-good repository state. Checkpoints are produced automatically by the Execution Runner at the conclusion of a successful, authorized execution-and-verification cycle. They are never modified after creation.

## Checkpoint Contents

| Field | Description |
|---|---|
| `id` | Sequential checkpoint identifier |
| `transitionId` | Turn ID of the originating transition |
| `commit` | Git HEAD commit hash at checkpoint time |
| `branch` | Active branch at checkpoint time |
| `timestamp` | ISO 8601 creation timestamp |
| `verifications` | Array of verification command results |
| `allPassed` | `true` if every verification command passed |
| `fingerprint` | Total file count and sorted list of source file paths |
| `artifacts` | Primary files, dependency neighborhood, and verification commands from the context |

## Storage

Checkpoints are persisted under `.navi/checkpoints/`:
- `checkpoint-<id>.json` — immutable per-turn checkpoint record
- `latest.json` — always overwritten to mirror the most recent checkpoint

## API

- `createCheckpoint(...)`: Constructs an immutable `NaviCheckpoint` value.
- `saveCheckpoint(projectDir, checkpoint)`: Writes checkpoint and updates `latest.json`.
- `loadCheckpoint(projectDir, id)`: Loads and schema-validates a checkpoint by ID.
- `loadLatestCheckpoint(projectDir)`: Loads the most recent checkpoint.
- `listCheckpoints(projectDir)`: Returns all checkpoints sorted by ID.
- `compareCheckpoints(previous, current)`: Produces a `CheckpointDiff` showing commit changes, file additions/removals, and verification status changes.

## CLI Commands

- `navi checkpoint` — prints the latest verified checkpoint
- `navi checkpoint list` — prints all persisted checkpoints
- `navi checkpoint --json` — JSON output

## Integration Points

- **Execution Runner** (`navi run`): Automatically creates a checkpoint when `authorized` is true.
- **`navi observe`**: Appends the latest checkpoint to the observation output.
- **`navi start`**: Appends the latest checkpoint as section 8 in the orchestration report.
