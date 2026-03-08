# @tokentop/agent-antigravity

[![npm](https://img.shields.io/npm/v/@tokentop/agent-antigravity?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/@tokentop/agent-antigravity)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

> **DEPRECATED** — Use [`@tokentop/agent-gemini`](https://github.com/tokentopapp/agent-gemini) instead.

This package is a thin wrapper that re-exports `@tokentop/agent-gemini`. Gemini CLI and Antigravity write identical session files to `~/.gemini/tmp/` using the same `ConversationRecord` format from `@google/gemini-cli-core` — there is no way to distinguish which tool created a given session. The canonical `@tokentop/agent-gemini` plugin handles both.

## Migration

```diff
- import plugin from '@tokentop/agent-antigravity';
+ import plugin from '@tokentop/agent-gemini';
```

```diff
- bun add @tokentop/agent-antigravity
+ bun add @tokentop/agent-gemini
```

## Backward Compatibility

This package re-exports all public API from `@tokentop/agent-gemini`, including deprecated aliases:

- `ANTIGRAVITY_SESSIONS_PATH` → `GEMINI_SESSIONS_PATH`

## License

MIT
