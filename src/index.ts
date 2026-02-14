import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createAgentPlugin,
  type AgentFetchContext,
  type PluginContext,
  type SessionParseOptions,
  type SessionUsageData,
} from '@tokentop/plugin-sdk';

// TODO: Implement session parsing for Antigravity
// See @tokentop/agent-opencode for a complete reference implementation.

const antigravityAgentPlugin = createAgentPlugin({
  id: 'antigravity',
  type: 'agent',
  name: 'Antigravity',
  version: '0.1.0',

  meta: {
    description: 'Antigravity coding agent session tracking',
    homepage: 'https://antigravity.dev',
  },

  permissions: {
    filesystem: {
      read: true,
      paths: ['~/.config/Claude'],
    },
  },

  agent: {
    name: 'Antigravity',
    command: 'antigravity',
    configPath: path.join(os.homedir(), '.config', 'Claude'),
    sessionPath: path.join(os.homedir(), '.config', 'Claude'),
  },

  capabilities: {
    sessionParsing: false,
    authReading: false,
    realTimeTracking: false,
    multiProvider: false,
  },

  async isInstalled(_ctx: PluginContext): Promise<boolean> {
    return fs.existsSync(path.join(os.homedir(), '.config', 'Claude', 'antigravity-accounts.json'));
  },

  async parseSessions(_options: SessionParseOptions, _ctx: AgentFetchContext): Promise<SessionUsageData[]> {
    return [];
  },
});

export default antigravityAgentPlugin;
