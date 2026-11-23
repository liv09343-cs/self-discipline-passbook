import type { Book, Session } from '../types';
import {
  coinBalance,
  redeemCount,
  starTotal,
  streakDays,
  todayMinutes,
  totalEarned,
  totalMinutes,
  totalSpent,
  weekMinutes,
} from './ledger';
import { round1 } from './money';
import { dayKey, startOfDay } from './date';

export interface BookMetrics {
  totalMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  streak: number;
  coinsIn: number;
  coinsOut: number;
  balance: number;
  stars: number;
  redeemCount: number;
  ddlDone: number;
  ddlTotal: number;
  ddlRate: number;
}

export function computeMetrics(book: Book): BookMetrics {
  const ddlDone = book.deadlines.filter((deadline) => deadline.done).length;
  const ddlTotal = book.deadlines.length;
  return {
    totalMinutes: Math.round(totalMinutes(book.sessions)),
    todayMinutes: Math.round(todayMinutes(book.sessions)),
    weekMinutes: Math.round(weekMinutes(book.sessions)),
    streak: streakDays(book.sessions),
    coinsIn: totalEarned(book.ledger),
    coinsOut: totalSpent(book.ledger),
    balance: coinBalance(book.ledger),
    stars: starTotal(book.ledger),
    redeemCount: redeemCount(book.ledger),
    ddlDone,
    ddlTotal,
    ddlRate: ddlTotal > 0 ? Math.round((ddlDone / ddlTotal) * 100) : 0,
  };
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatDay {
  key: string;
  date: Date;
  minutes: number;
  level: HeatLevel;
}

function heatLevel(minutes: number): HeatLevel {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

export function heatmap30(book: Book, today = new Date()): HeatDay[] {
  const buckets = new Map<string, number>();
  book.sessions.forEach((session) => {
    const key = dayKey(new Date(session.endedAt));
    buckets.set(
      key,
      (buckets.get(key) ?? 0) + session.durationMs / 60000,
    );
  });
  const days: HeatDay[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = startOfDay(today);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const minutes = Math.round(buckets.get(key) ?? 0);
    days.push({
      key,
      date: new Date(date),
      minutes,
      level: heatLevel(minutes),
    });
  }
  return days;
}

export interface DayDetail {
  key: string;
  date: Date;
  minutes: number;
  coins: number;
  stars: number;
  sessions: Session[];
}

export function dayDetails(book: Book): DayDetail[] {
  const map = new Map<string, DayDetail>();
  book.sessions.forEach((session) => {
    const ended = new Date(session.endedAt);
    const key = dayKey(ended);
    const group =
      map.get(key) ??
      ({
        key,
        date: startOfDay(ended),
        minutes: 0,
        coins: 0,
        stars: 0,
        sessions: [],
      } satisfies DayDetail);
    group.minutes += session.durationMs / 60000;
    group.coins = round1(group.coins + session.coins);
    group.stars += session.stars;
    group.sessions.push(session);
    map.set(key, group);
  });
  return [...map.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({
      ...group,
      minutes: Math.round(group.minutes),
      sessions: [...group.sessions].sort((a, b) =>
        b.endedAt.localeCompare(a.endedAt),
      ),
    }));
}

export function recentSessions(book: Book, limit = 8): Session[] {
  return [...book.sessions]
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, limit);
}