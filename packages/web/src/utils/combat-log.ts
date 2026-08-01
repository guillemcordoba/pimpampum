import type { LogEntry } from '@pimpampum/engine';

/** Download a combat log as a plain-text file, grouped by round. */
export function downloadCombatLog(entries: LogEntry[]): void {
  const lines: string[] = [];
  let lastRound = -1;
  for (const e of entries) {
    if (e.round !== lastRound) { lines.push(''); lastRound = e.round; }
    lines.push(e.message);
  }
  const blob = new Blob([lines.join('\n').trim() + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pimpampum-combat-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}
