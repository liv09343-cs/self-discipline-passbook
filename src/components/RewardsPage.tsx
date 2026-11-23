import { useState, type FormEvent } from 'react';
import { useApp } from '../store/AppStore';
import { formatCoins } from '../lib/money';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
}

export function RewardsPage({ toast }: Props) {
  const { book, balance, actions } = useApp();
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('8');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleRedeem = (id: string) => {
    const result = actions.redeemReward(id);
    toast(result.message, result.ok ? 'ok' : 'warn');
    if (result.ok) setConfirmId(null);
  };

  const handleRemove = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      window.setTimeout(() => {
        setConfirmId((current) => (current === id ? null : current));
      }, 3000);
      return;
    }
    actions.removeReward(id);
    setConfirmId(null);
    toast('已删除该奖励', 'warn');
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(cost);
    if (!title.trim()) {
      toast('请填写奖励名称', 'warn');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast('所需硬币需为正整数', 'warn');
      return;
    }
    actions.addReward(title, value);
    toast(`已添加奖励「${title.trim()}」`, 'ok');
    setTitle('');
    setCost('8');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">延迟满足兑换</h2>
          <p className="page-sub">
            「{book.name}」的硬币只属于这本存折。先完成自律，再心安理得地享受。
          </p>
        </div>
        <span className="tag tag-vermilion">
          可用 {formatCoins(balance)} 枚硬币
        </span>
      </div>

      {book.rewards.length === 0 ? (
        <div className="empty">
          <span className="empty-glyph">兑</span>
          还没有设置奖励。
          <br />
          写下那个一直想去做的事，给它标一个价格。
        </div>
      ) : (
        <div className="reward-grid">
          {book.rewards.map((reward) => {
            const canRedeem = balance >= reward.cost;
            const progress = Math.min(
              100,
              Math.round((balance / reward.cost) * 100),
            );
            const times = book.ledger.filter(
              (entry) => entry.rewardId === reward.id,
            ).length;
            return (
              <article
                key={reward.id}
                className={`reward-card${canRedeem ? ' is-unlocked' : ''}`}
              >
                {times > 0 && (
                  <span className="reward-times">已兑 {times} 次</span>
                )}
                <div className="reward-glyph">{reward.glyph}</div>
                <div className="reward-main">
                  <div className="reward-title">{reward.title}</div>
                  <div className="reward-cost">
                    需 <b>{reward.cost}</b> 枚硬币
                    {canRedeem
                      ? ' · 现在可以兑换'
                      : ` · 还差 ${formatCoins(reward.cost - balance)} 枚`}
                  </div>
                  <div className="reward-track">
                    <div
                      className="reward-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="reward-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!canRedeem}
                      onClick={() => handleRedeem(reward.id)}
                    >
                      兑换
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger-ghost"
                      onClick={() => handleRemove(reward.id)}
                    >
                      {confirmId === reward.id ? '确认删除' : '删除'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <form className="reward-form" onSubmit={handleAdd}>
        <label className="field">
          <span>新的延迟满足奖励</span>
          <input
            className="input"
            value={title}
            maxLength={16}
            placeholder="例如：周末看一场演唱会"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>所需硬币</span>
          <input
            className="input"
            type="number"
            min={1}
            max={999}
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          添加奖励
        </button>
      </form>
    </>
  );
}