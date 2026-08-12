# Adapter layer

The adapter layer defines boundaries between Navi's deterministic engine and
external project observation.

`RepositoryParser` describes an implementation that reads a project directory.
It returns a `RepositoryIndex`, which contains in-memory structural output
records: repository-relative path, lightweight imports and exports, and a
subsystem derived from the path. `RepositoryIndexService` is the current
implementation. It walks source files deterministically, excludes generated and
runtime directories, and uses text matching only; it does not parse syntax trees
or retain a persistent knowledge base.

`RepositoryObserver` remains the lightweight Git-diff observer used by `navi
observe`. It reports changed paths independently of the full source-file index.

`SymbolProvider` and `ContextProvider` define semantic-analysis boundaries.
`IndexSymbolProvider` extracts deterministic source code symbols from an indexed
repository, while `FileContextProvider` reads source text for selected paths.
`VerificationProvider` wraps the existing verification command runner.

The index service is not registered with the CLI. The current CLI, state flow,
and validation behavior remain unchanged. `navi observe` uses the repository
observer directly to present the current changed paths; it does not require
Navi state.

`navi context` consumes the in-memory index and current turn to produce a
bounded structural context: files in scope plus their direct import/dependent
neighborhood. It does not read source text, call an AI, or persist context.
