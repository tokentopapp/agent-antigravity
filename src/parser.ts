import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentFetchContext, SessionParseOptions, SessionUsageData } from '@tokentop/plugin-sdk';
import { CACHE_TTL_MS, evictSessionAggregateCache, sessionAggregateCache, sessionCache, sessionMetadataIndex } from './cache.ts';
import { ANTIGRAVITY_SESSIONS_PATH, getChatsDir, getProjectDirs } from './paths.ts';
import type { AntigravityGeminiMessage, AntigravitySessionFile } from './types.ts';
import { readSessionFile } from './utils.ts';
import {
  consumeForceFullReconciliation,
  sessionWatcher,
  startSessionWatcher,
  watchChatsDir,
} from './watcher.ts';

interface ParsedSessionFile {
  sessionId: string;
  filePath: string;
  mtimeMs: number;
  projectHash: string;
}

export function toTimestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

export function isValidSessionFile(data: unknown): data is AntigravitySessionFile {
  if (!data || typeof data !== 'object') return false;

  const candidate = data as Partial<AntigravitySessionFile>;
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.length === 0) return false;
  if (!Array.isArray(candidate.messages)) return false;

  return true;
}

export function parseSessionFileRows(
  sessionData: AntigravitySessionFile,
  mtimeMs: number,
): SessionUsageData[] {
  const deduped = new Map<string, SessionUsageData>();

  for (const message of sessionData.messages) {
    if (!isTokenBearingGeminiMessage(message)) continue;

    const usage: SessionUsageData = {
      sessionId: sessionData.sessionId,
      providerId: 'google',
      modelId: message.model,
      tokens: {
        input: message.tokens.input,
        output: message.tokens.output,
      },
      timestamp: toTimestamp(message.timestamp, mtimeMs),
      sessionUpdatedAt: mtimeMs,
    };

    if (message.tokens.cached > 0) {
      usage.tokens.cacheRead = message.tokens.cached;
    }

    deduped.set(message.id, usage);
  }

  return Array.from(deduped.values());
}

export async function parseSessionsFromProjects(
  options: SessionParseOptions,
  ctx: AgentFetchContext,
): Promise<SessionUsageData[]> {
  const limit = options.limit ?? 100;
  const since = options.since;

  try {
    await fs.access(ANTIGRAVITY_SESSIONS_PATH);
  } catch {
    ctx.logger.debug('No Antigravity sessions directory found');
    return [];
  }

  startSessionWatcher();

  const now = Date.now();
  if (
    !options.sessionId &&
    limit === sessionCache.lastLimit &&
    now - sessionCache.lastCheck < CACHE_TTL_MS &&
    sessionCache.lastResult.length > 0 &&
    sessionCache.lastSince === since
  ) {
    ctx.logger.debug('Antigravity: using cached sessions (within TTL)', { count: sessionCache.lastResult.length });
    return sessionCache.lastResult;
  }

  const dirtyPaths = new Set(sessionWatcher.dirtyPaths);
  sessionWatcher.dirtyPaths.clear();

  const needsFullStat = consumeForceFullReconciliation();
  if (needsFullStat) {
    ctx.logger.debug('Antigravity: full reconciliation sweep triggered');
  }

  const sessionFiles: ParsedSessionFile[] = [];
  const seenFilePaths = new Set<string>();

  let statCount = 0;
  let statSkipCount = 0;
  let dirtyHitCount = 0;

  const projectDirs = await getProjectDirs();

  for (const projectDirPath of projectDirs) {
    const chatsDirPath = getChatsDir(projectDirPath);
    watchChatsDir(chatsDirPath);

    let entries;
    try {
      entries = await fs.readdir(chatsDirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const projectHash = path.basename(projectDirPath);

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const filePath = path.join(chatsDirPath, entry.name);
      seenFilePaths.add(filePath);

      const isDirty = dirtyPaths.has(filePath);
      if (isDirty) dirtyHitCount++;

      const metadata = sessionMetadataIndex.get(filePath);
      if (!isDirty && !needsFullStat && metadata) {
        statSkipCount++;

        if (options.sessionId && metadata.sessionId !== options.sessionId) continue;

        if (!since || metadata.mtimeMs >= since) {
          sessionFiles.push({
            sessionId: metadata.sessionId,
            filePath,
            mtimeMs: metadata.mtimeMs,
            projectHash,
          });
        }
        continue;
      }

      statCount++;
      let mtimeMs: number;
      try {
        const stat = await fs.stat(filePath);
        mtimeMs = stat.mtimeMs;
      } catch {
        sessionMetadataIndex.delete(filePath);
        continue;
      }

      if (metadata && metadata.mtimeMs === mtimeMs) {
        if (options.sessionId && metadata.sessionId !== options.sessionId) continue;

        if (!since || metadata.mtimeMs >= since) {
          sessionFiles.push({
            sessionId: metadata.sessionId,
            filePath,
            mtimeMs: metadata.mtimeMs,
            projectHash,
          });
        }
        continue;
      }

      const sessionData = await readSessionFile(filePath);
      const sessionId = sessionData?.sessionId ?? path.basename(entry.name, '.json');

      if (options.sessionId && sessionId !== options.sessionId) continue;

      sessionMetadataIndex.set(filePath, { mtimeMs, sessionId });
      if (!since || mtimeMs >= since) {
        sessionFiles.push({ sessionId, filePath, mtimeMs, projectHash });
      }
    }
  }

  for (const cachedPath of sessionMetadataIndex.keys()) {
    if (!seenFilePaths.has(cachedPath)) {
      sessionMetadataIndex.delete(cachedPath);
    }
  }

  sessionFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const sessions: SessionUsageData[] = [];
  let aggregateCacheHits = 0;
  let aggregateCacheMisses = 0;

  for (const file of sessionFiles) {
    const cached = sessionAggregateCache.get(file.sessionId);
    if (cached && cached.updatedAt === file.mtimeMs) {
      cached.lastAccessed = now;
      aggregateCacheHits++;
      sessions.push(...cached.usageRows);
      continue;
    }

    aggregateCacheMisses++;

    const sessionData = await readSessionFile(file.filePath);
    if (!sessionData || !isValidSessionFile(sessionData)) continue;

    const usageRows = parseSessionFileRows(sessionData, file.mtimeMs);

    sessionAggregateCache.set(file.sessionId, {
      updatedAt: file.mtimeMs,
      usageRows,
      lastAccessed: now,
    });

    sessions.push(...usageRows);
  }

  evictSessionAggregateCache();

  if (!options.sessionId) {
    sessionCache.lastCheck = Date.now();
    sessionCache.lastResult = sessions;
    sessionCache.lastLimit = limit;
    sessionCache.lastSince = since;
  }

  ctx.logger.debug('Antigravity: parsed sessions', {
    count: sessions.length,
    sessionFiles: sessionFiles.length,
    statChecks: statCount,
    statSkips: statSkipCount,
    dirtyHits: dirtyHitCount,
    aggregateCacheHits,
    aggregateCacheMisses,
    metadataIndexSize: sessionMetadataIndex.size,
    aggregateCacheSize: sessionAggregateCache.size,
  });

  return sessions;
}
