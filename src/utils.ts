import * as fs from 'fs/promises';
import type { AntigravityAccountsFile, AntigravitySessionFile } from './types.ts';

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function readSessionFile(filePath: string): Promise<AntigravitySessionFile | null> {
  return readJsonFile<AntigravitySessionFile>(filePath);
}

export async function readAccountsFile(filePath: string): Promise<AntigravityAccountsFile | null> {
  return readJsonFile<AntigravityAccountsFile>(filePath);
}

export function extractSessionIdFromFilename(filename: string): string | undefined {
  const match = filename.match(/session-[\dT-]+-([a-f0-9]{8})\.json$/);
  return match?.[1];
}
