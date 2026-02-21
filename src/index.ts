import * as fs from 'fs';
import {
  createAgentPlugin,
  oauthCredential,
  type AgentCredentials,
  type AgentFetchContext,
  type PluginContext,
  type SessionParseOptions,
  type SessionUsageData,
} from '@tokentop/plugin-sdk';
import { CACHE_TTL_MS, SESSION_AGGREGATE_CACHE_MAX, sessionAggregateCache, sessionCache, sessionMetadataIndex } from './cache.ts';
import { parseSessionsFromProjects } from './parser.ts';
import { ANTIGRAVITY_ACCOUNTS_PATH, ANTIGRAVITY_GUI_PATH, ANTIGRAVITY_SESSIONS_PATH, GEMINI_HOME } from './paths.ts';
import { readAccountsFile } from './utils.ts';
import { RECONCILIATION_INTERVAL_MS, startActivityWatch, stopActivityWatch } from './watcher.ts';

const antigravityAgentPlugin = createAgentPlugin({
  id: 'antigravity',
  type: 'agent',
  name: 'Antigravity',
  version: '0.1.0',

  meta: {
    description: 'Antigravity coding agent session tracking',
    homepage: 'https://one.google.com/explore-plan/gemini-advanced',
  },

  permissions: {
    filesystem: {
      read: true,
      paths: ['~/.gemini', '~/.config/opencode'],
    },
  },

  agent: {
    name: 'Antigravity',
    command: 'antigravity',
    configPath: ANTIGRAVITY_ACCOUNTS_PATH,
    sessionPath: ANTIGRAVITY_SESSIONS_PATH,
  },

  capabilities: {
    sessionParsing: true,
    authReading: true,
    realTimeTracking: true,
    multiProvider: false,
  },

  startActivityWatch(_ctx: PluginContext, callback): void {
    startActivityWatch(callback);
  },

  stopActivityWatch(_ctx: PluginContext): void {
    stopActivityWatch();
  },

  async isInstalled(_ctx: PluginContext): Promise<boolean> {
    return (
      fs.existsSync(ANTIGRAVITY_ACCOUNTS_PATH) ||
      fs.existsSync(ANTIGRAVITY_SESSIONS_PATH) ||
      fs.existsSync(ANTIGRAVITY_GUI_PATH)
    );
  },

  async readCredentials(_ctx: AgentFetchContext): Promise<AgentCredentials> {
    const providers: AgentCredentials['providers'] = {};

    const accounts = await readAccountsFile(ANTIGRAVITY_ACCOUNTS_PATH);
    if (accounts?.accounts && accounts.accounts.length > 0) {
      const activeIndex = accounts.activeIndex ?? 0;
      const account = accounts.accounts[activeIndex] ?? accounts.accounts[0];

      if (account && (account.refreshToken || account.accessToken)) {
        providers.google = oauthCredential(
          account.accessToken ?? '',
          {
            refreshToken: account.refreshToken,
            expiresAt: account.expiresAt,
            source: 'external',
          },
        );
      }
    }

    return { providers };
  },

  async parseSessions(options: SessionParseOptions, ctx: AgentFetchContext): Promise<SessionUsageData[]> {
    return parseSessionsFromProjects(options, ctx);
  },
});

export {
  CACHE_TTL_MS,
  GEMINI_HOME,
  ANTIGRAVITY_SESSIONS_PATH,
  ANTIGRAVITY_ACCOUNTS_PATH,
  RECONCILIATION_INTERVAL_MS,
  SESSION_AGGREGATE_CACHE_MAX,
  sessionAggregateCache,
  sessionCache,
  sessionMetadataIndex,
};

export default antigravityAgentPlugin;
