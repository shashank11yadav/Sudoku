import type { Difficulty } from '../engine';

/** Local calendar date as YYYY-MM-DD, so the daily puzzle changes at the player's midnight. */
export function localDateKey(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Difficulty climbs through the week: easy early on, expert on Sunday. */
const BY_WEEKDAY: readonly Difficulty[] = ['expert', 'easy', 'easy', 'medium', 'medium', 'hard', 'hard'];

export function dailyPuzzle(date: Date): { seed: string; difficulty: Difficulty; label: string } {
  const key = localDateKey(date);
  const difficulty = BY_WEEKDAY[date.getDay()] ?? 'medium';
  return { seed: `daily:${key}`, difficulty, label: `Daily ${key}` };
}
