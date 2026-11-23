export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000,
  );
}

export function formatCnDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function formatCnDateWithWeek(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${
    WEEKDAY_CN[d.getDay()]
  }`;
}

export function formatShortDate(d: Date): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatLedgerTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromInputs(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '23:59').split(':').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return date.toISOString();
}

export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export type DueLevel = 'overdue' | 'today' | 'urgent' | 'soon' | 'normal';

export function dueInfo(iso: string): {
  label: string;
  level: DueLevel;
  diffMs: number;
  days: number;
} {
  const target = new Date(iso);
  const diffMs = target.getTime() - Date.now();
  const days = daysBetween(target, new Date());
  if (diffMs < 0) {
    return {
      label: days === 0 ? '今日已过时' : `已过期 ${Math.abs(days)} 天`,
      level: 'overdue',
      diffMs,
      days,
    };
  }
  if (days === 0) {
    const hours = diffMs / 3600000;
    if (hours < 1) {
      return {
        label: `${Math.max(1, Math.round(diffMs / 60000))} 分钟后`,
        level: 'today',
        diffMs,
        days,
      };
    }
    return { label: `今天 · 剩 ${Math.round(hours)} 小时`, level: 'today', diffMs, days };
  }
  if (days <= 3) {
    return { label: `${days} 天后`, level: 'urgent', diffMs, days };
  }
  if (days <= 14) {
    return { label: `${days} 天后`, level: 'soon', diffMs, days };
  }
  return { label: `${days} 天后`, level: 'normal', diffMs, days };
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatShortDate(new Date(iso));
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}