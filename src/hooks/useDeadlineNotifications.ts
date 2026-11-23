import { useEffect } from 'react';
import type { Book } from '../types';
import { dueInfo } from '../lib/date';

const NOTIFIED_KEY = 'passbook-notified-v1';
const CHECK_INTERVAL = 60000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function loadNotified(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotified(map: Record<string, number>): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
  } catch {
    return;
  }
}

export function useDeadlineNotifications(books: Book[]): void {
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (typeof window === 'undefined') return;

    const check = () => {
      if (Notification.permission !== 'granted') return;
      const now = Date.now();
      const notified = loadNotified();
      let changed = false;

      books.forEach((book) => {
        book.deadlines.forEach((deadline) => {
          if (deadline.done) return;
          const due = new Date(deadline.dueAt).getTime();
          if (Number.isNaN(due)) return;
          const diff = due - now;
          if (diff > WINDOW_MS) return;
          if (diff < -WINDOW_MS) return;
          const last = notified[deadline.id] ?? 0;
          if (now - last < WINDOW_MS) return;

          notified[deadline.id] = now;
          changed = true;
          const info = dueInfo(deadline.dueAt);
          const time = new Date(due).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          try {
            const notification = new Notification(
              diff < 0
                ? `DDL 已过期：${deadline.title}`
                : `DDL 提醒：${deadline.title}`,
              {
                body: `${book.name} · ${info.label} · ${time}`,
                icon: './icons/icon-192.png',
                tag: `deadline-${deadline.id}`,
              },
            );
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch {
            return;
          }
        });
      });

      if (changed) saveNotified(notified);
    };

    check();
    const timer = window.setInterval(check, CHECK_INTERVAL);
    return () => window.clearInterval(timer);
  }, [books]);
}