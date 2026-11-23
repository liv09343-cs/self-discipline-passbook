import { useMemo, useState } from 'react';
import type { Deadline } from '../types';
import { CATEGORY_META, REMIND_OPTIONS } from '../types';
import { useApp } from '../store/AppStore';
import {
  WEEKDAY_CN,
  buildMonthGrid,
  dayKey,
  dueInfo,
  formatCnDateWithWeek,
  formatTime,
  sameDay,
} from '../lib/date';
import { downloadIcs } from '../lib/ics';
import { DeadlineForm } from './DeadlineForm';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
}

function remindLabel(minutes: number): string {
  return (
    REMIND_OPTIONS.find((option) => option.value === minutes)?.label ??
    `提前 ${minutes} 分钟`
  );
}

export function CalendarPage({ toast }: Props) {
  const { book, actions } = useApp();
  const today = new Date();
  const [visible, setVisible] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [selected, setSelected] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const days = useMemo(
    () => buildMonthGrid(visible.year, visible.month),
    [visible.year, visible.month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    book.deadlines.forEach((deadline) => {
      const key = dayKey(new Date(deadline.dueAt));
      const list = map.get(key) ?? [];
      list.push(deadline);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
    return map;
  }, [book.deadlines]);

  const selectedList = (
    byDay.get(dayKey(selected)) ?? []
  ).slice();

  const upcoming = book.deadlines
    .filter((d) => !d.done)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 8);

  const shift = (delta: number) => {
    const next = new Date(visible.year, visible.month + delta, 1);
    setVisible({ year: next.getFullYear(), month: next.getMonth() });
    setSelected(next);
  };

  const goToday = () => {
    const now = new Date();
    setVisible({ year: now.getFullYear(), month: now.getMonth() });
    setSelected(now);
  };

  const selectDay = (date: Date) => {
    setSelected(date);
    if (
      date.getMonth() !== visible.month ||
      date.getFullYear() !== visible.year
    ) {
      setVisible({ year: date.getFullYear(), month: date.getMonth() });
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (deadline: Deadline) => {
    setEditing(deadline);
    setFormOpen(true);
  };

  const handleRemove = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      window.setTimeout(() => {
        setConfirmId((current) => (current === id ? null : current));
      }, 3000);
      return;
    }
    actions.removeDeadline(id);
    setConfirmId(null);
    toast('已删除该 DDL', 'warn');
  };

  const handleExport = () => {
    const active = book.deadlines.filter((d) => !d.done);
    if (active.length === 0) {
      toast('没有未完成的 DDL 可导出', 'warn');
      return;
    }
    downloadIcs(book.deadlines);
    toast(
      `已导出 ${active.length} 条 DDL，导入手机或电脑日历即可获得系统提醒`,
      'ok',
    );
  };

  const renderItem = (deadline: Deadline) => {
    const meta = CATEGORY_META[deadline.category];
    const info = dueInfo(deadline.dueAt);
    return (
      <div
        key={deadline.id}
        className={`dl-item${deadline.done ? ' is-done' : ''}`}
      >
        <div className={`dl-accent ${deadline.done ? 'normal' : info.level}`} />
        <button
          type="button"
          className="dl-check"
          aria-label={deadline.done ? '标记为未完成' : '标记为完成'}
          onClick={() => actions.toggleDeadline(deadline.id)}
        >
          {deadline.done ? '✓' : ''}
        </button>
        <div className="dl-body">
          <div className="dl-top">
            <span className={`dl-badge tag-${meta.tone}`}>{meta.short}</span>
            <span className="dl-title">{deadline.title}</span>
          </div>
          <div className="dl-meta">
            <span>{formatTime(deadline.dueAt)}</span>
            <span>{deadline.done ? '已完成' : info.label}</span>
            <span>提醒：{remindLabel(deadline.remindBeforeMin)}</span>
            {deadline.source === 'ocr' && <span>图片导入</span>}
          </div>
          {deadline.note && (
            <div className="mini-note" style={{ marginTop: 3 }}>
              {deadline.note}
            </div>
          )}
        </div>
        <div className="dl-actions">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => openEdit(deadline)}
          >
            编辑
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger-ghost"
            onClick={() => handleRemove(deadline.id)}
          >
            {confirmId === deadline.id ? '确认' : '删除'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">DDL 日历</h2>
          <p className="page-sub">
            「{book.name}」的 DDL 独立成册：手动录入或从图片识读，标记在日历上；导出 .ics
            后，手机与电脑日历会接替你提醒。
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={handleExport}>
            导出 .ics
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={openCreate}
          >
            ＋ 添加 DDL
          </button>
        </div>
      </div>

      <div className="calendar-layout">
        <section className="panel">
          <div className="cal-toolbar">
            <div className="cal-month">
              {visible.year} 年 {visible.month + 1} 月
            </div>
            <div className="cal-nav">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => shift(-1)}
              >
                上一月
              </button>
              <button type="button" className="btn btn-sm" onClick={goToday}>
                今天
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => shift(1)}
              >
                下一月
              </button>
            </div>
          </div>

          <div className="cal-grid" role="grid">
            {WEEKDAY_CN.map((weekday, index) => (
              <div
                key={weekday}
                className={`cal-dow${
                  index === 0 || index === 6 ? ' is-weekend' : ''
                }`}
                role="columnheader"
              >
                周{weekday}
              </div>
            ))}
            {days.map((date) => {
              const list = byDay.get(dayKey(date)) ?? [];
              const isOut =
                date.getMonth() !== visible.month ||
                date.getFullYear() !== visible.year;
              const isToday = sameDay(date, new Date());
              const isSelected = sameDay(date, selected);
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  role="gridcell"
                  className={`cal-cell${isOut ? ' is-out' : ''}${
                    isToday ? ' is-today' : ''
                  }${isSelected ? ' is-selected' : ''}${
                    isWeekend ? ' is-weekend' : ''
                  }`}
                  aria-label={`${date.getMonth() + 1} 月 ${date.getDate()} 日，${
                    list.length
                  } 项 DDL`}
                  onClick={() => selectDay(date)}
                >
                  <span className="cal-dnum">{date.getDate()}</span>
                  <span className="cal-marks">
                    {list.slice(0, 4).map((deadline) => (
                      <span
                        key={deadline.id}
                        className={`cal-mark ${
                          CATEGORY_META[deadline.category].tone
                        }${deadline.done ? ' is-done' : ''}`}
                      />
                    ))}
                    {list.length > 4 && (
                      <span className="cal-mark ink" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cal-legend">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <span key={key}>
                <span className={`cal-mark ${meta.tone}`} />
                {meta.label}
              </span>
            ))}
            <span>
              <span className="cal-mark is-done" />
              已完成
            </span>
          </div>
        </section>

        <aside>
          <section className="panel" style={{ marginBottom: 16 }}>
            <h3 className="panel-title">
              {formatCnDateWithWeek(selected.toISOString())}
            </h3>
            <p className="panel-sub">
              {selectedList.length > 0
                ? `这一天共有 ${selectedList.length} 项安排`
                : '这一天暂时没有 DDL'}
            </p>
            {selectedList.length > 0 ? (
              <div className="deadline-list">
                {selectedList.map(renderItem)}
              </div>
            ) : (
              <div className="empty" style={{ padding: '18px 0 8px' }}>
                <span className="empty-glyph">闲</span>
                留白也是日程的一部分。
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={openCreate}
                  >
                    在这天添加 DDL
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <h3 className="panel-title">近期到期</h3>
            <p className="panel-sub">按截止时间排序，别让它们悄悄逼近。</p>
            {upcoming.length === 0 ? (
              <p className="mini-note">近期没有待办的 DDL，账页很清爽。</p>
            ) : (
              <div className="deadline-list">
                {upcoming.map(renderItem)}
              </div>
            )}
          </section>
        </aside>
      </div>

      {formOpen && (
        <DeadlineForm
          key={editing?.id ?? `new-${selected.toISOString()}`}
          initial={editing}
          defaultDate={selected}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          toast={toast}
        />
      )}
    </>
  );
}