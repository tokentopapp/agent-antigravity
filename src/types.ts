import type { SessionUsageData } from '@tokentop/plugin-sdk';

export interface AntigravityTokenUsage {
  input: number;
  output: number;
  cached: number;
  thoughts: number;
  tool: number;
  total: number;
}

export interface AntigravityToolCallResult {
  functionResponse?: {
    id?: string;
    name?: string;
    response?: Record<string, unknown>;
  };
}

export interface AntigravityToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: AntigravityToolCallResult[];
  status?: string;
  timestamp?: string;
  displayName?: string;
  description?: string;
  renderOutputAsMarkdown?: boolean;
  resultDisplay?: string;
}

export interface AntigravityThought {
  subject: string;
  description: string;
  timestamp: string;
}

export interface AntigravityGeminiMessage {
  id: string;
  timestamp: string;
  type: 'gemini';
  content: string;
  tokens: AntigravityTokenUsage;
  model: string;
  thoughts?: AntigravityThought[];
  toolCalls?: AntigravityToolCall[];
}

export interface AntigravityUserMessage {
  id: string;
  timestamp: string;
  type: 'user';
  content: string | Array<{ text?: string; [key: string]: unknown }>;
  displayContent?: Array<{ text?: string; [key: string]: unknown }>;
}

export interface AntigravityInfoMessage {
  id: string;
  timestamp: string;
  type: 'info';
  content: string;
}

export type AntigravityMessage =
  | AntigravityGeminiMessage
  | AntigravityUserMessage
  | AntigravityInfoMessage;

export interface AntigravitySessionFile {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: AntigravityMessage[];
}

export interface AntigravityAccount {
  email?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  addedAt?: number;
  lastUsed?: number;
  rateLimitResetTimes?: Record<string, unknown>;
  managedProjectId?: string;
  cachedQuota?: Record<string, {
    remainingFraction?: number;
    resetTime?: string;
    modelCount?: number;
  }>;
  enabled?: boolean;
  fingerprint?: {
    deviceId?: string;
    sessionToken?: string;
    userAgent?: string;
    apiClient?: string;
    clientMetadata?: Record<string, unknown>;
    createdAt?: number;
  };
}

export interface AntigravityAccountsFile {
  version?: number;
  accounts?: AntigravityAccount[];
  activeIndex?: number;
  activeIndexByFamily?: Record<string, number>;
}

export interface SessionAggregateCacheEntry {
  updatedAt: number;
  usageRows: SessionUsageData[];
  lastAccessed: number;
}
