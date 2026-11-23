import { useApp } from '../store/AppStore';
import { formatLedgerTime } from '../lib/date';
import {
  starTotal,
  totalEarned,
  totalSpent,
} from '../lib/ledger';
import { formatCoins, round1 } from '../lib/money';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
}

const KIND_LABEL: Record<string, string> = {
  earn: '自律存入',
  spend: '奖励支取',
  grant: '开户赠送',
};

export function LedgerPage({ toast }: Props) {
  const { book, balance } = useApp();

  const ordered = [...book.ledger].sort((a, b) => a.at.localeCompare(b.at));
  let running = 0;
  const withBalance = ordered.map((entry) => {
    running = round1(
      running + (entry.kind === 'spend' ? -entry.coins : entry.coins),
    );
    return { ...entry, runningBalance: running };
  });
  const rows = [...withBalance].reverse();

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">账目明细</h2>
          <p className="page-sub">
            「{book.name}」的每一笔存入与支取，都按时间记录在册。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            toast('账目会随存折自动保存；建议在「数据与同步」中定期导出备份', 'warn')
          }
        >
          对账说明
        </button>
      </div>

      <div className="ledger-summary">
        <span>
          累计存入<b>{formatCoins(totalEarned(book.ledger))}</b>枚
        </span>
        <span>
          累计支取<b>{formatCoins(totalSpent(book.ledger))}</b>枚
        </span>
        <span>
          当前结余<b>{formatCoins(balance)}</b>枚
        </span>
        <span>
          累计星星<b>{starTotal(book.ledger)}</b>颗
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <span className="empty-glyph">空</span>
          账页还是空白的。
          <br />
          去「存入」完成第一次自律计时，写下第一笔。
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="ledger-table">
            <thead>
              <tr>
                <th className="col-date">日期</th>
                <th>摘要</th>
                <th className="col-amt">存入</th>
                <th className="col-amt">支取</th>
                <th className="col-amt">结余</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td className="col-date">{formatLedgerTime(entry.at)}</td>
                  <td className="ledger-note">
                    {entry.note}
                    <small>
                      {KIND_LABEL[entry.kind] ?? '账目'}
                      {entry.stars > 0 ? ` · ★ ${entry.stars}` : ''}
                    </small>
                  </td>
                  <td className="col-amt">
                    {entry.kind === 'spend' ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="amt-in">
                        +{formatCoins(entry.coins)}
                      </span>
                    )}
                  </td>
                  <td className="col-amt">
                    {entry.kind === 'spend' ? (
                      <span className="amt-out">
                        −{formatCoins(entry.coins)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="col-amt">
                    <span className="mono-num">
                      {formatCoins(entry.runningBalance)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}