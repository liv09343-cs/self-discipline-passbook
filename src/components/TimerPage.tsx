import { useState, type FormEvent } from 'react';
import { useApp, useElapsedMs, type Settlement } from '../store/AppStore';
import { formatClock, formatMinutes } from '../lib/date';
import { coinsFromMinutes, formatCoins } from '../lib/money';
import {
  streakDays,
  subjectBreakdown,
  todayMinutes,
  totalMinutes,
  weekMinutes,
} from '../lib/ledger';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
  onGoCalendar: () => void;
}

export function TimerPage({ toast, onGoCalendar }: Props) {
  const { state, book, actions } = useApp();
  const elapsed = useElapsedMs();
  const [note, setNote] = useState('');
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState(state.settings.coinsPerHourDefault);
  const [discardArmed, setDiscardArmed] = useState(false);

  const timer = book.timer;
  const subject =
    book.subjects.find((item) => item.id === timer.subjectId) ?? null;
  const estimate = subject
    ? coinsFromMinutes(elapsed / 60000, subject.coinsPerHour)
    : 0;

  const today = todayMinutes(book.sessions);
  const week = weekMinutes(book.sessions);
  const total = totalMinutes(book.sessions);
  const streak = streakDays(book.sessions);
  const breakdown = subjectBreakdown(book.sessions);
  const maxMinutes = breakdown[0]?.minutes ?? 0;

  const start = (subjectId: string) => {
    actions.startTimer(subjectId);
    setSettlement(null);
    setDiscardArmed(false);
  };

  const finish = () => {
    const result = actions.finishTimer(note.trim());
    setSettlement(result);
    setNote('');
    setDiscardArmed(false);
    if (result.counted) {
      toast(
        `已存入 ${formatCoins(result.coins)} 枚硬币、${result.stars} 颗星，继续加油`,
        'ok',
      );
    } else {
      toast(
        `本次 ${Math.round(result.minutes)} 分钟，未满 ${
          state.settings.minSessionMinutes
        } 分钟，暂未入账`,
        'warn',
      );
    }
  };

  const discard = () => {
    if (!discardArmed) {
      setDiscardArmed(true);
      window.setTimeout(() => setDiscardArmed(false), 3000);
      return;
    }
    actions.discardTimer();
    setDiscardArmed(false);
    setNote('');
    toast('已放弃本次计时，时间不会存入', 'warn');
  };

  const addSubject = (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    actions.addSubject(newName, newRate);
    toast(`已添加自律内容「${newName.trim()}」`, 'ok');
    setNewName('');
    setNewRate(state.settings.coinsPerHourDefault);
    setAdding(false);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">自律存入</h2>
          <p className="page-sub">
            选定一项自律内容，按下计时。专注结束，时间按「{formatCoins(1)}{' '}
            枚 / 小时」折算成硬币，记入「{book.name}」。
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onGoCalendar}>
          去安排 DDL
        </button>
      </div>

      {settlement && (
        <div
          className="panel panel-tight"
          style={{
            marginBottom: 16,
            borderColor: settlement.counted
              ? 'var(--vermilion)'
              : 'var(--gold)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className="panel-title" style={{ fontSize: 14 }}>
                {settlement.counted ? '本次已存入存折' : '本次未满起存时长'}
              </div>
              <div className="mini-note">
                {settlement.subjectName} · {formatMinutes(settlement.minutes)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="balance-value"
                style={{
                  justifyContent: 'flex-end',
                  fontSize: 26,
                  color: settlement.counted
                    ? 'var(--vermilion)'
                    : 'var(--ink-3)',
                }}
              >
                {formatCoins(settlement.coins)}
                <span className="balance-unit">枚</span>
              </div>
              <div className="mini-note">
                {settlement.counted
                  ? `+ ${settlement.stars} 颗星`
                  : '再专注一会就能入账'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="timer-layout">
        <section className="panel">
          {!timer.subjectId || !subject ? (
            <>
              <h3 className="panel-title">选择自律内容</h3>
              <p className="panel-sub">
                每一项都有自己的换算利率。汇率越低，硬币越值钱。
              </p>
              <div className="subject-grid">
                {book.subjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="subject-chip"
                    onClick={() => start(item.id)}
                  >
                    <span className="subject-glyph">{item.glyph}</span>
                    <span>
                      <span className="subject-name">{item.name}</span>
                      <span className="subject-rate">
                        每小时存 {formatCoins(item.coinsPerHour)} 枚
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="section-sep">或者</div>

              {!adding ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAdding(true)}
                >
                  ＋ 自定义自律内容
                </button>
              ) : (
                <form className="form-grid" onSubmit={addSubject}>
                  <label className="field">
                    <span>自律内容名称</span>
                    <input
                      className="input"
                      value={newName}
                      maxLength={8}
                      autoFocus
                      placeholder="例如：背单词、写代码"
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>每小时存入硬币</span>
                    <input
                      className="input"
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.5}
                      value={newRate}
                      onChange={(event) =>
                        setNewRate(Number(event.target.value) || 0.5)
                      }
                    />
                  </label>
                  <div className="form-actions span-2">
                    <button className="btn btn-primary btn-sm" type="submit">
                      添加
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setAdding(false)}
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}

              <p className="mini-note" style={{ marginTop: 16 }}>
                换算规则：专注满 {state.settings.minSessionMinutes}{' '}
                分钟起存，按项目利率折算，可存入 0.1 枚的小数。
              </p>
            </>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div>
                  <h3 className="panel-title">{subject.name}</h3>
                  <p className="panel-sub" style={{ marginBottom: 0 }}>
                    每小时存 {formatCoins(subject.coinsPerHour)} 枚硬币
                  </p>
                </div>
                <span
                  className={`tag ${
                    timer.running ? 'tag-vermilion' : 'tag-brown'
                  }`}
                >
                  {timer.running ? '计时中' : '已暂停'}
                </span>
              </div>

              <div className="clock-face">
                <div className="clock-label">FOCUS TIMER</div>
                <div
                  className={`clock-display${
                    timer.running ? ' is-live' : ''
                  }`}
                >
                  {formatClock(elapsed)}
                </div>
                <div className="clock-sub">
                  {timer.running ? (
                    <>
                      <span className="blink-dot" />
                      正在存入 · {subject.name}
                    </>
                  ) : (
                    '时间已冻结，可继续或结束'
                  )}
                </div>
              </div>

              <label className="field" style={{ marginBottom: 12 }}>
                <span>本次专注备注（可选）</span>
                <input
                  className="input"
                  value={note}
                  maxLength={40}
                  placeholder="例如：高数第三章习题"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>

              <div className="timer-actions">
                {timer.running ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={actions.pauseTimer}
                  >
                    暂停
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={actions.resumeTimer}
                  >
                    继续计时
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={finish}
                >
                  结束并存折
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={discard}
                >
                  {discardArmed ? '再点一次确认放弃' : '放弃本次'}
                </button>
              </div>

              <p className="mini-note" style={{ marginTop: 12 }}>
                当前预计可存{' '}
                <b style={{ color: 'var(--vermilion)' }}>
                  {formatCoins(estimate)}
                </b>{' '}
                枚 · 满 {state.settings.minSessionMinutes} 分钟起存
              </p>
            </>
          )}
        </section>

        <aside className="panel">
          <h3 className="panel-title">存折小结</h3>
          <p className="panel-sub">时间不会说谎，账目会替你记得。</p>
          <div className="stat-list">
            <div className="stat-row">
              <span className="k">今日专注</span>
              <span className="v">{formatMinutes(today)}</span>
            </div>
            <div className="stat-row">
              <span className="k">近七日专注</span>
              <span className="v">{formatMinutes(week)}</span>
            </div>
            <div className="stat-row">
              <span className="k">累计专注</span>
              <span className="v">{formatMinutes(total)}</span>
            </div>
            <div className="stat-row">
              <span className="k">连续自律</span>
              <span className="v">{streak} 天</span>
            </div>
          </div>

          <hr className="divider-dashed" />

          <div className="panel-sub" style={{ marginBottom: 8 }}>
            项目时长分布
          </div>
          {breakdown.length === 0 ? (
            <p className="mini-note">
              还没有存入记录。完成第一次专注后，这里会长出你的时间分布。
            </p>
          ) : (
            <div className="subject-bars">
              {breakdown.slice(0, 5).map((row, index) => {
                const name =
                  book.subjects.find((item) => item.id === row.subjectId)
                    ?.name ?? '已删除项目';
                const width =
                  maxMinutes > 0
                    ? Math.max(6, Math.round((row.minutes / maxMinutes) * 100))
                    : 6;
                return (
                  <div className="bar-row" key={row.subjectId}>
                    <span>{name}</span>
                    <span className="bar-track">
                      <span
                        className={`bar-fill ${
                          ['', 'alt', 'gold'][index % 3]
                        }`}
                        style={{ display: 'block', width: `${width}%` }}
                      />
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      {formatMinutes(row.minutes)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}