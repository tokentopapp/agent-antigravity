/**
 * @deprecated Use @tokentop/agent-gemini instead.
 *
 * This package is a thin wrapper that re-exports @tokentop/agent-gemini.
 * Gemini CLI and Antigravity write identical session files to ~/.gemini/tmp/
 * using the same ConversationRecord format — there is no way to distinguish
 * which tool created a given session. The canonical plugin handles both.
 */
export {
  default,
  CACHE_TTL_MS,
  GEMINI_HOME,
  GEMINI_SESSIONS_PATH,
  GEMINI_OAUTH_CREDS_PATH,
  ANTIGRAVITY_ACCOUNTS_PATH,
  RECONCILIATION_INTERVAL_MS,
  SESSION_AGGREGATE_CACHE_MAX,
  sessionAggregateCache,
  sessionCache,
  sessionMetadataIndex,
} from '@tokentop/agent-gemini';

/** @deprecated Use GEMINI_SESSIONS_PATH from @tokentop/agent-gemini instead. */
export { GEMINI_SESSIONS_PATH as ANTIGRAVITY_SESSIONS_PATH } from '@tokentop/agent-gemini';
