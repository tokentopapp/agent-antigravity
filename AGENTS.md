# AGENTS.md — @tokentop/agent-antigravity

## What is TokenTop?

[TokenTop](https://github.com/tokentopapp/tokentop) is a terminal-based dashboard for monitoring
AI token usage and costs across providers and coding agents. It uses a plugin architecture
(`@tokentop/plugin-sdk`) with four plugin types: **provider** (API cost fetching), **agent**
(session parsing), **theme** (TUI colors), and **notification** (alerts).

This package is an **agent plugin**. Agent plugins parse local session files written by coding
agents (Claude Code, Cursor, etc.) to extract per-turn token usage, then feed normalized
`SessionUsageData` rows back to the TokenTop core for display. This plugin specifically tracks
Antigravity coding agent session usage.

## Build & Run

```bash
bun install                  # Install dependencies
bun run build                # Full build (types + JS bundle)
bun run build:types          # tsc --emitDeclarationOnly
bun run build:js             # bun build → dist/
bun run typecheck            # tsc --noEmit (strict)
bun test                     # Run all tests (bun test runner)
bun test src/parser.test.ts  # Run a single test file
bun test --watch             # Watch mode
```

CI runs `bun run build` then `bun run typecheck`. Both must pass.

## Project Structure

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Plugin entry point — `createAgentPlugin()` factory with all lifecycle methods, OAuth credential reading from accounts file, re-exports public API |
| `src/parser.ts` | Session parsing — walks project directories, reads JSON session files, extracts token-bearing Gemini messages into `SessionUsageData` rows with caching and dirty-path optimization |
| `src/watcher.ts` | File watching — dual watcher system: dirty-path tracking for incremental re-parsing, plus real-time activity delta detection via message ID diffing |
| `src/cache.ts` | Caching — TTL-based session result cache (2s), per-session aggregate cache with LRU eviction at 10K entries, file metadata index for stat-skip optimization |
| `src/paths.ts` | Path resolution — cross-platform Antigravity config/data directories (`~/.gemini`, `~/.config/opencode`), project directory enumeration helpers |
| `src/types.ts` | Type definitions — Antigravity session file format, message types (gemini/user/info), token usage breakdown, account/credentials structures |
| `src/utils.ts` | Utilities — generic JSON file reading, typed session and accounts file readers, session ID extraction from filenames |

## Architecture Notes

- **JSON session files**: Antigravity stores sessions as JSON in `~/.gemini/tmp/<project-hash>/chats/<session>.json`. Each file contains `{ sessionId, projectHash, startTime, lastUpdated, messages[] }`. Token-bearing messages have `type: 'gemini'` with a `tokens` object containing `{ input, output, cached, thoughts, tool, total }`.
- **Credentials**: OAuth tokens stored in `~/.config/opencode/antigravity-accounts.json` with a multi-account structure and `activeIndex`. The plugin reads `refreshToken`/`accessToken` from the active account and creates an `oauthCredential` for the `google` provider.
- **Installation detection**: Checks for existence of accounts file (`~/.config/opencode/antigravity-accounts.json`), sessions directory (`~/.gemini/tmp`), or GUI directory (`~/.gemini/antigravity`) — any one is sufficient.
- **Two-layer caching**: `sessionCache` (2s TTL full-result cache for the entire `parseSessions()` output) + `sessionAggregateCache` (per-session parsed rows, LRU eviction at 10K entries). A `sessionMetadataIndex` maps file paths to `{ mtimeMs, sessionId }` enabling stat-skip when files haven't changed.
- **Dirty tracking**: FSWatcher marks changed `.json` files in a `dirtyPaths` set; only dirty or previously-unknown files get re-stat'd and re-parsed. Unchanged files with valid metadata index entries skip both stat and parse entirely.
- **Reconciliation**: Full stat sweep forced every 10 minutes via `RECONCILIATION_INTERVAL_MS` interval timer. Stale metadata entries (files no longer on disk) are pruned after each parse cycle.
- **Activity watching**: Primes known message IDs at startup by reading all existing session files. On file change, reads the full session JSON and diffs message IDs against the known set to find new token-bearing messages. Emits an `ActivityUpdate` callback for each new message — this is separate from the session watcher to avoid coupling.
- **Deduplication**: Uses `message.id` as dedup key — both in `parseSessionFileRows()` (Map keyed by message ID) and in the activity watcher (Set of known IDs per file path).

## TypeScript Configuration

- **Strict mode**: `strict: true` — all strict checks enabled
- **No unused code**: `noUnusedLocals`, `noUnusedParameters` both `true`
- **No fallthrough**: `noFallthroughCasesInSwitch: true`
- **Target**: ESNext, Module: ESNext, ModuleResolution: bundler
- **Types**: `bun-types` (not `@types/node`)
- **Declaration**: Emits `.d.ts` + declaration maps + source maps

## Code Style

### Imports

- **Use `.ts` extensions** in all relative imports: `import { foo } from './bar.ts'`
- **Type-only imports** use the `type` keyword:
  ```typescript
  import type { SessionUsageData } from '@tokentop/plugin-sdk';
  import { createAgentPlugin, type AgentFetchContext } from '@tokentop/plugin-sdk';
  ```
- **Node.js modules** via namespace imports: `import * as fs from 'fs'`, `import * as path from 'path'`
- **Order**: External packages → relative imports (no blank line separator used)

### Module Format

- ESM only (`"type": "module"` in package.json)
- Named exports for everything except the main plugin (default export)
- Re-export public API items explicitly from `index.ts`

### Naming Conventions

- **Constants**: `UPPER_SNAKE_CASE` — `CACHE_TTL_MS`, `RECONCILIATION_INTERVAL_MS`
- **Functions**: `camelCase` — `parseSessionsFromProjects`, `readJsonlFile`
- **Interfaces**: `PascalCase` — `AntigravitySessionEntry`, `SessionWatcherState`
- **Type predicates**: `is` prefix — `isTokenBearingEntry(entry): entry is ...`
- **Unused required params**: Underscore prefix — `_ctx: PluginContext`
- **File names**: `kebab-case.ts`

### Types

- **Interfaces** for object shapes, not type aliases
- **Explicit return types** on all exported functions
- **Type predicates** for runtime validation guards (narrowing `unknown` → typed)
- **`Partial<T>`** for candidate validation instead of `as any`
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Validate unknown data at boundaries with type guard functions

### Functions

- **Functional style** — no classes. State held in module-level objects/Maps
- **Pure functions** where possible; side effects isolated to watcher/cache modules
- **Early returns** for guard clauses
- **Async/await** throughout, no raw Promise chains

### Error Handling

- **Empty catch blocks are intentional** for graceful degradation (filesystem ops that may fail)
- Pattern: `try { await fs.access(path); } catch { return []; }`
- Never throw from filesystem operations — return empty/default values
- Use `Number.isFinite()` for numeric validation, not `isNaN()`
- Validate at data boundaries, trust within module

### Formatting

- No explicit formatter config (Prettier/ESLint not configured)
- 2-space indentation (observed convention)
- Single quotes for strings
- Trailing commas in multiline structures
- Semicolons always
- Opening brace on same line

## Plugin SDK Contract

The plugin SDK (`@tokentop/plugin-sdk`) defines the interface contract between plugins and
the TokenTop core (`~/development/tokentop/ttop`). The SDK repo lives at
`~/development/tokentop/plugin-sdk`. This plugin is a peer dependency consumer — it declares
`@tokentop/plugin-sdk` as a `peerDependency`, not a bundled dep.

This plugin implements the `AgentPlugin` interface via the `createAgentPlugin()` factory:

```typescript
const plugin = createAgentPlugin({
  id: 'antigravity',
  type: 'agent',
  agent: { name: 'Antigravity', command: 'antigravity', configPath, sessionPath },
  capabilities: { sessionParsing: true, realTimeTracking: true, ... },
  isInstalled(ctx) { ... },
  parseSessions(options, ctx) { ... },
  startActivityWatch(ctx, callback) { ... },
  stopActivityWatch(ctx) { ... },
});
export default plugin;
```

### AgentPlugin interface (required methods)

| Method | Signature | Purpose |
|--------|-----------|---------|
| `isInstalled` | `(ctx: PluginContext) → Promise<boolean>` | Check if this agent exists on the user's machine |
| `parseSessions` | `(options: SessionParseOptions, ctx: AgentFetchContext) → Promise<SessionUsageData[]>` | Parse session files into normalized usage rows |
| `startActivityWatch` | `(ctx: PluginContext, callback: ActivityCallback) → void` | Begin real-time file watching, emit deltas |
| `stopActivityWatch` | `(ctx: PluginContext) → void` | Tear down watchers |

### Key SDK types

| Type | Shape | Used for |
|------|-------|----------|
| `SessionUsageData` | `{ sessionId, providerId, modelId, tokens: { input, output, cacheRead?, cacheWrite? }, timestamp, sessionUpdatedAt?, projectPath?, sessionName? }` | Normalized per-turn usage row returned from `parseSessions` |
| `ActivityUpdate` | `{ sessionId, messageId, tokens: { input, output, cacheRead?, cacheWrite? }, timestamp }` | Real-time delta emitted via `ActivityCallback` |
| `SessionParseOptions` | `{ sessionId?, limit?, since?, timePeriod? }` | Filters passed by core to `parseSessions` |
| `AgentFetchContext` | `{ http, logger, config, signal }` | Context bag — `ctx.logger` for debug logging |
| `PluginContext` | `{ logger, storage, config, signal }` | Context for lifecycle methods |

### SDK subpath imports

| Import path | Use |
|-------------|-----|
| `@tokentop/plugin-sdk` | Everything (types + helpers) |
| `@tokentop/plugin-sdk/types` | Type definitions only |
| `@tokentop/plugin-sdk/testing` | `createTestContext()` for tests |

## Commit Conventions

Conventional Commits enforced by CI on both PR titles and commit messages:

```
feat(parser): add support for cache_creation breakdown
fix(watcher): handle race condition in delta reads
chore(deps): update dependencies
refactor: simplify session metadata indexing
```

Valid prefixes: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
Optional scope in parentheses. Breaking changes use `!` suffix before colon.

## Release Process

- semantic-release via GitHub Actions (currently manual `workflow_dispatch`)
- Publishes to npm as `@tokentop/agent-antigravity` with public access + provenance
- Runs `bun run clean && bun run build` before publish (`prepublishOnly`)
- Branches: `main` only

## Testing

- Test runner: `bun test` (Bun's built-in test runner)
- Test files: `*.test.ts` (excluded from tsconfig compilation, picked up by bun test)
- Place test files adjacent to source: `src/parser.test.ts`
- Use `createTestContext()` from `@tokentop/plugin-sdk/testing` for mock contexts
