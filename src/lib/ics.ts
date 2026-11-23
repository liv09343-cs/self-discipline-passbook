import type { Deadline } from '../types';
import { CATEGORY_META } from '../types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function floating(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 73) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

export function buildIcs(
  deadlines: Deadline[],
  calendarName = '自律存折 · DDL',
): string {
  const stamp = utcStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Self Discipline Passbook//Deadline Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  deadlines
    .filter((d) => !d.done)
    .forEach((d) => {
      const start = new Date(d.dueAt);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const meta = CATEGORY_META[d.category];
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${d.id}@self-discipline-passbook`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART:${floating(start)}`);
      lines.push(`DTEND:${floating(end)}`);
      lines.push(`SUMMARY:${esc(`【${meta.label}】${d.title}`)}`);
      lines.push(
        `DESCRIPTION:${esc(
          [d.note, '由「自律存折」导出的 DDL 提醒'].filter(Boolean).join('\n'),
        )}`,
      );
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${esc(`DDL 提醒：${d.title}`)}`);
      if (d.remindBeforeMin > 0) {
        lines.push(`TRIGGER:-PT${d.remindBeforeMin}M`);
      } else {
        lines.push('TRIGGER:PT0M');
      }
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

export function downloadIcs(deadlines: Deadline[]): void {
  const content = buildIcs(deadlines);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  link.href = url;
  link.download = `自律存折-DDL-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}