import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export const GEMINI_HOME = path.join(os.homedir(), '.gemini');

export const ANTIGRAVITY_SESSIONS_PATH = path.join(GEMINI_HOME, 'tmp');

export const ANTIGRAVITY_ACCOUNTS_PATH = path.join(
  os.homedir(),
  '.config',
  'opencode',
  'antigravity-accounts.json',
);

export const ANTIGRAVITY_GUI_PATH = path.join(GEMINI_HOME, 'antigravity');

export async function getProjectDirs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(ANTIGRAVITY_SESSIONS_PATH, { withFileTypes: true });
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'bin') {
        dirs.push(path.join(ANTIGRAVITY_SESSIONS_PATH, entry.name));
      }
    }

    return dirs;
  } catch {
    return [];
  }
}

export function getChatsDir(projectDir: string): string {
  return path.join(projectDir, 'chats');
}
