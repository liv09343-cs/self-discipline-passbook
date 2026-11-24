import { useState, type ReactNode } from 'react';
import type { TabKey } from '../types';
import { useApp } from '../store/AppStore';
import { starTotal, streakDays } from '../lib/ledger';
import { formatCoins } from '../lib/money';
import { formatCnDate } from '../lib/date';
import { BookBar } from './BookBar';
import { BookPanel } from './BookPanel';
import { DataPanel } from './DataPanel';
import type { ToastTone } from './Toast';

const TABS: { key: TabKey; label: string; index: string }[] = [
  { key: 'timer', label: '存入', index: '壹' },
  { key: 'ledger', label: '账目', index: '贰' },
  { key: 'rewards', label: '兑换', index: '叁' },
  { key: 'calendar', label: '日历', index: '肆' },
  { key: 'stats', label: '统计', index: '伍' },
];

interface Props {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onShowCover: () => void;
  toast: (text: string, tone?: ToastTone) => void;
  children: ReactNode;
}

export function PassbookShell({
  tab,
  onTabChange,
  onShowCover,
  toast,
  children,
}: Props) {
  const { state, book, balance, actions } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(state.profile.name);
  const [bookOpen, setBookOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const pendingDdl = book.deadlines.filter((deadline) => !deadline.done).length;

  const commitName = () => {
    const next = draftName.trim();
    if (next && next !== state.profile.name) {
      actions.updateProfileName(next);
    } else {
      setDraftName(state.profile.name);
    }
    setEditingName(false);
  };

  return (
    <div className="app-stage">
      <div className="passbook">
        <header className="pb-head">
          <div>
            <div className="brand-kicker">SELF-DISCIPLINE TIME BANK</div>
            <h1 className="brand-cn">自律存折</h1>
            <div className="brand-en">
              SELF-DISCIPLINE PASSBOOK · 储蓄你的专注
            </div>
            <p className="mini-note" style={{ marginTop: 10, maxWidth: 520 }}>
              {book.motto || '把自律存进时间银行。'}
            </p>
          </div>
          <div className="brand-stamp" aria-hidden="true">
            <span>自律</span>
            <span>存折</span>
            <small>TIME BANK</small>
          </div>
        </header>

        <BookBar
          onOpenManage={() => setBookOpen(true)}
          onOpenData={() => setDataOpen(true)}
        />

        <dl className="pb-meta">
          <div>
            <dt>户名</dt>
            {editingName ? (
              <input
                className="input"
                style={{ padding: '2px 6px', fontSize: 14 }}
                value={draftName}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitName();
                  if (event.key === 'Escape') {
                    setDraftName(state.profile.name);
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  title="点击修改户名"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setDraftName(state.profile.name);
                    setEditingName(true);
                  }}
                >
                  {state.profile.name}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '0 4px', fontSize: 10, flexShrink: 0 }}
                  onClick={() => {
                    setDraftName(state.profile.name);
                    setEditingName(true);
                  }}
                >
                  修改
                </button>
              </dd>
            )}
          </div>
          <div>
            <dt>账号</dt>
            <dd className="mono-num">{book.accountNo}</dd>
          </div>
          <div>
            <dt>开户日期</dt>
            <dd>{formatCnDate(book.openedAt)}</dd>
          </div>
          <div>
            <dt>当前存折</dt>
            <dd>
              {book.glyph} · {book.name}
            </dd>
          </div>
        </dl>

        <section className="pb-balance" aria-label="账户概览">
          <div className="balance-cell">
            <div className="balance-label">存款余额</div>
            <div className="balance-value">
              {formatCoins(balance)}
              <span className="balance-unit">枚硬币</span>
            </div>
            <div className="balance-note">可随时兑换延迟满足</div>
          </div>
          <div className="balance-cell">
            <div className="balance-label">累计星星</div>
            <div className="balance-value">
              {starTotal(book.ledger)}
              <span className="balance-unit">颗</span>
            </div>
            <div className="balance-note">每次专注的纪念</div>
          </div>
          <div className="balance-cell">
            <div className="balance-label">连续自律</div>
            <div className="balance-value">
              {streakDays(book.sessions)}
              <span className="balance-unit">天</span>
            </div>
            <div className="balance-note">别让存折断档</div>
          </div>
          <div className="balance-cell">
            <div className="balance-label">未完成 DDL</div>
            <div className="balance-value">
              {pendingDdl}
              <span className="balance-unit">项</span>
            </div>
            <div className="balance-note">当前账本内</div>
          </div>
        </section>

        <nav className="pb-tabs" aria-label="存折分页">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pb-tab${tab === item.key ? ' is-active' : ''}`}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => onTabChange(item.key)}
            >
              <span className="pb-tab-index">{item.index}</span>
              {item.label}
              {item.key === 'timer' && book.timer.running && (
                <span
                  className="blink-dot"
                  style={{ marginLeft: 6, marginRight: 0, width: 6, height: 6 }}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </nav>

        <main className="pb-body">{children}</main>

        <footer className="pb-foot">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onShowCover}
          >
            封面
          </button>
          <span>自律存折 · 每一笔专注都有回执</span>
          <span>
            本页 <strong>{TABS.findIndex((item) => item.key === tab) + 1}</strong>{' '}
            / 05 · 「{book.name}」· 数据保存在本机
          </span>
        </footer>

        {bookOpen && (
          <BookPanel onClose={() => setBookOpen(false)} toast={toast} />
        )}
        {dataOpen && (
          <DataPanel onClose={() => setDataOpen(false)} toast={toast} />
        )}
      </div>
    </div>
  );
}