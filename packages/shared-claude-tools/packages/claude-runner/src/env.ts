/**
 * Build a clean environment for spawning Claude CLI.
 * Strips CLAUDE* vars (except CLAUDE_PATH), LD_*, and DYLD_* to prevent
 * "nested session" rejection and .so injection.
 */
export function cleanEnv(extra?: Record<string, string>): Record<string, string> {
  const filtered = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => {
      if (k === 'CLAUDE_PATH') return true;
      if (k.startsWith('CLAUDE')) return false;
      if (k.startsWith('LD_')) return false;
      if (k.startsWith('DYLD_')) return false;
      return true;
    })
  ) as Record<string, string>;

  if (extra) {
    Object.assign(filtered, extra);
  }

  return filtered;
}
