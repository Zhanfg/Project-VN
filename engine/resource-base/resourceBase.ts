declare global {
  interface Window {
    __AFTER_SCHOOL_GAME_BASE__?: string;
  }
}

const DEFAULT_GAME_BASE = './game/';

export function gameBase(): string {
  const configured = window.__AFTER_SCHOOL_GAME_BASE__?.trim();
  if (!configured) return DEFAULT_GAME_BASE;
  return configured.endsWith('/') ? configured : configured + '/';
}

export function gamePath(relativePath: string): string {
  const normalized = relativePath.replace(/^[./\\]+/, '').replaceAll('\\', '/');
  return gameBase() + normalized;
}
