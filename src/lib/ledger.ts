import type { LedgerEntry, Session } from '../types';
import { dayKey, startOfDay } from './date';
import { round1 } from './money';

export function coinBalance(ledger: LedgerEntry[]): number {
  return round1(
    ledger.reduce(
      (sum, entry) =>
        entry.kind === 'spend' ? sum - entry.coins : sum + entry.coins,
      0,
    ),
  );
}

export function starTotal(ledger: LedgerEntry[]): number {
  return ledger.reduce((sum, entry) => sum + entry.stars, 0);
}

export function totalSpent(ledger: LedgerEntry[]): number {
  return round1(
    ledger.reduce(
      (sum, entry) => (entry.kind === 'spend' ? sum + entry.coins : sum),
      0,
    ),
  );
}

export function totalEarned(ledger: LedgerEntry[]): number {
  return round1(
    ledger.reduce(
      (sum, entry) => (entry.kind === 'spend' ? sum : sum + entry.coins),
      0,
    ),
  );
}

export function redeemCount(ledger: LedgerEntry[]): number {
  return ledger.filter((entry) => entry.kind === 'spend').length;
}

export function totalMinutes(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.durationMs / 60000, 0);
}

export function todayMinutes(sessions: Session[]): number {
  const now = new Date();
  return sessions
    .filter((s) => dayKey(new Date(s.endedAt)) === dayKey(now))
    .reduce((sum, s) => sum + s.durationMs / 60000, 0);
}

export function weekMinutes(sessions: Session[]): number {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - 6);
  return sessions
    .filter((s) => new Date(s.endedAt).getTime() >= cutoff.getTime())
    .reduce((sum, s) => sum + s.durationMs / 60000, 0);
}

export function streakDays(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const keys = new Set(
    sessions
      .filter((s) => s.durationMs >= 60000)
      .map((s) => dayKey(new Date(s.endedAt))),
  );
  let streak = 0;
  const cursor = startOfDay(new Date());
  if (!keys.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!keys.has(dayKey(cursor))) return 0;
  }
  for (let i = 0; i < 366; i += 1) {
    if (!keys.has(dayKey(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function subjectBreakdown(
  sessions: Session[],
): { subjectId: string; minutes: number }[] {
  const map = new Map<string, number>();
  sessions.forEach((s) => {
    map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + s.durationMs / 60000);
  });
  return [...map.entries()]
    .map(([subjectId, minutes]) => ({ subjectId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}