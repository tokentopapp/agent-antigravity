import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { ActivityCallback, ActivityUpdate } from '@tokentop/plugin-sdk';
import { ANTIGRAVITY_SESSIONS_PATH, getChatsDir, getProjectDirs } from './paths.ts';
import type { AntigravityGeminiMessage } from './types.ts';

export interface SessionWatcherState {
  chatsWatchers: Map<string, fsSync.FSWatcher>;
  projectWatchers: Map<string, fsSync.FSWatcher>;
  rootWatcher: fsSync.FSWatcher | null;
  dirtyPaths: Set<string>;
  reconciliationTimer: ReturnType<typeof setInterval> | null;
  started: boolean;
}

interface ActivityWatcherState {
  chatsWatchers: Map<string, fsSync.FSWatcher>;
  projectWatchers: Map<string, fsSync.FSWatcher>;
  rootWatcher: fsSync.FSWatcher | null;
  callback: ActivityCallback | null;
  knownSessions: Map<string, Set<string>>;
  started: boolean;
}

export const RECONCILIATION_INTERVAL_MS = 10 * 60 * 1000;

export const sessionWatcher: SessionWatcherState = {
  chatsWatchers: new Map(),
  projectWatchers: new Map(),
  rootWatcher: null,
  dirtyPaths: new Set(),
  reconciliationTimer: null,
  started: false,
};

const activityWatcher: ActivityWatcherState = {
  chatsWatchers: new Map(),
  projectWatchers: new Map(),
  rootWatcher: null,
  callback: null,
  knownSessions: new Map(),
  started: false,
};

export let forceFullReconciliation = false;

export function isTokenBearingGeminiMessage(entry: unknown): entry is AntigravityGeminiMessage {
  if (!entry || typeof entry !== 'object') return false;

  const candidate = entry as Partial<AntigravityGeminiMessage>;
  if (candidate.type !== 'gemini') return false;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) return false;
  if (typeof candidate.model !== 'string' || candidate.model.trim().length === 0) return false;
  if (!candidate.tokens || typeof candidate.tokens !== 'object') return false;
  if (typeof candidate.tokens.input !== 'number') return false;
  if (typeof candidate.tokens.output !== 'number') return false;
  if (candidate.tokens.input <= 0 && candidate.tokens.output <= 0) return false;

  return true;
}

export function toTimestamp(value: string | undefined): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function watchChatsDirForActivity(chatsDirPath: string): void {
  if (activityWatcher.chatsWatchers.has(chatsDirPath)) return;

  try {
    const watcher = fsSync.watch(chatsDirPath, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      const filePath = path.join(chatsDirPath, filename);
      void processSessionDelta(filePath);
    });

    activityWatcher.chatsWatchers.set(chatsDirPath, watcher);
  } catch {
  }
}

function watchProjectDirForActivity(projectDirPath: string): void {
  if (activityWatcher.projectWatchers.has(projectDirPath)) return;

  const chatsDirPath = getChatsDir(projectDirPath);

  try {
    fsSync.accessSync(chatsDirPath);
    watchChatsDirForActivity(chatsDirPath);
    void primeKnownSessions(chatsDirPath);
  } catch {
  }

  try {
    const watcher = fsSync.watch(projectDirPath, (eventType, filename) => {
      if (eventType !== 'rename' || filename !== 'chats') return;
      watchChatsDirForActivity(getChatsDir(projectDirPath));
      void primeKnownSessions(getChatsDir(projectDirPath));
    });
    activityWatcher.projectWatchers.set(projectDirPath, watcher);
  } catch {
  }
}

async function primeKnownSessions(chatsDirPath: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(chatsDirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const filePath = path.join(chatsDirPath, entry.name);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as Partial<{ sessionId: string; messages: unknown[] }>;
      if (data.sessionId && Array.isArray(data.messages)) {
        const knownIds = new Set<string>();
        for (const msg of data.messages) {
          if (msg && typeof msg === 'object' && 'id' in msg && typeof (msg as { id: unknown }).id === 'string') {
            knownIds.add((msg as { id: string }).id);
          }
        }
        activityWatcher.knownSessions.set(filePath, knownIds);
      }
    } catch {
    }
  }
}

async function processSessionDelta(filePath: string): Promise<void> {
  const callback = activityWatcher.callback;
  if (!callback) return;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return;
  }

  let data: Partial<{ sessionId: string; messages: unknown[] }>;
  try {
    data = JSON.parse(content) as Partial<{ sessionId: string; messages: unknown[] }>;
  } catch {
    return;
  }

  if (!data.sessionId || !Array.isArray(data.messages)) return;

  const knownIds = activityWatcher.knownSessions.get(filePath) ?? new Set<string>();
  const newMessages: AntigravityGeminiMessage[] = [];

  for (const msg of data.messages) {
    if (!isTokenBearingGeminiMessage(msg)) continue;
    if (knownIds.has(msg.id)) continue;
    newMessages.push(msg);
    knownIds.add(msg.id);
  }

  activityWatcher.knownSessions.set(filePath, knownIds);

  for (const msg of newMessages) {
    const tokens: ActivityUpdate['tokens'] = {
      input: msg.tokens.input,
      output: msg.tokens.output,
    };
    if (msg.tokens.cached > 0) {
      tokens.cacheRead = msg.tokens.cached;
    }

    callback({
      sessionId: data.sessionId,
      messageId: msg.id,
      tokens,
      timestamp: toTimestamp(msg.timestamp),
    });
  }
}

export function watchChatsDir(chatsDirPath: string): void {
  if (sessionWatcher.chatsWatchers.has(chatsDirPath)) return;

  try {
    const watcher = fsSync.watch(chatsDirPath, (_eventType, filename) => {
      if (filename?.endsWith('.json')) {
        const filePath = path.join(chatsDirPath, filename);
        sessionWatcher.dirtyPaths.add(filePath);
      }
    });
    sessionWatcher.chatsWatchers.set(chatsDirPath, watcher);
  } catch {
  }
}

function watchProjectDirForSession(projectDirPath: string): void {
  if (sessionWatcher.projectWatchers.has(projectDirPath)) return;

  const chatsDirPath = getChatsDir(projectDirPath);

  try {
    fsSync.accessSync(chatsDirPath);
    watchChatsDir(chatsDirPath);
  } catch {
  }

  try {
    const watcher = fsSync.watch(projectDirPath, (eventType, filename) => {
      if (eventType !== 'rename' || filename !== 'chats') return;
      watchChatsDir(getChatsDir(projectDirPath));
    });
    sessionWatcher.projectWatchers.set(projectDirPath, watcher);
  } catch {
  }
}

export function startSessionWatcher(): void {
  if (sessionWatcher.started) return;
  sessionWatcher.started = true;

  try {
    sessionWatcher.rootWatcher = fsSync.watch(ANTIGRAVITY_SESSIONS_PATH, (eventType, filename) => {
      if (eventType !== 'rename' || !filename) return;
      watchProjectDirForSession(path.join(ANTIGRAVITY_SESSIONS_PATH, filename));
    });
  } catch {
  }

  void getProjectDirs().then((dirs) => {
    for (const dirPath of dirs) {
      watchProjectDirForSession(dirPath);
    }
  });

  sessionWatcher.reconciliationTimer = setInterval(() => {
    forceFullReconciliation = true;
  }, RECONCILIATION_INTERVAL_MS);
}

export function stopSessionWatcher(): void {
  if (sessionWatcher.reconciliationTimer) {
    clearInterval(sessionWatcher.reconciliationTimer);
    sessionWatcher.reconciliationTimer = null;
  }

  for (const watcher of sessionWatcher.chatsWatchers.values()) {
    watcher.close();
  }
  sessionWatcher.chatsWatchers.clear();

  for (const watcher of sessionWatcher.projectWatchers.values()) {
    watcher.close();
  }
  sessionWatcher.projectWatchers.clear();

  if (sessionWatcher.rootWatcher) {
    sessionWatcher.rootWatcher.close();
    sessionWatcher.rootWatcher = null;
  }

  sessionWatcher.dirtyPaths.clear();
  sessionWatcher.started = false;
}

export function consumeForceFullReconciliation(): boolean {
  const value = forceFullReconciliation;
  if (forceFullReconciliation) {
    forceFullReconciliation = false;
  }
  return value;
}

export function startActivityWatch(callback: ActivityCallback): void {
  activityWatcher.callback = callback;

  if (activityWatcher.started) return;
  activityWatcher.started = true;

  try {
    activityWatcher.rootWatcher = fsSync.watch(ANTIGRAVITY_SESSIONS_PATH, (eventType, filename) => {
      if (eventType !== 'rename' || !filename) return;

      const projectDirPath = path.join(ANTIGRAVITY_SESSIONS_PATH, filename);
      watchProjectDirForActivity(projectDirPath);
    });
  } catch {
  }

  void getProjectDirs().then((dirs) => {
    for (const dirPath of dirs) {
      watchProjectDirForActivity(dirPath);
    }
  });
}

export function stopActivityWatch(): void {
  for (const watcher of activityWatcher.chatsWatchers.values()) {
    watcher.close();
  }
  activityWatcher.chatsWatchers.clear();

  for (const watcher of activityWatcher.projectWatchers.values()) {
    watcher.close();
  }
  activityWatcher.projectWatchers.clear();

  if (activityWatcher.rootWatcher) {
    activityWatcher.rootWatcher.close();
    activityWatcher.rootWatcher = null;
  }

  activityWatcher.knownSessions.clear();
  activityWatcher.callback = null;
  activityWatcher.started = false;

  stopSessionWatcher();
}
