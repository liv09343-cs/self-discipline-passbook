import { useApp } from '../store/AppStore';
import { formatCoins } from '../lib/money';
import { formatCnDate } from '../lib/date';

interface Props {
  onOpen: () => void;
}

export function PassbookCover({ onOpen }: Props) {
  const { state, book, balance } = useApp();

  return (
    <div className="cover-stage">
      <div className="cover-book">
        <div className="cover-kicker">SELF-DISCIPLINE TIME BANK</div>
        <div className="cover-stamp" aria-hidden="true">
          <span>自律</span>
          <span>存折</span>
        </div>
        <h1 className="cover-title">自律存折</h1>
        <div className="cover-en">SELF-DISCIPLINE PASSBOOK</div>
        <div className="cover-rule" />
        <dl className="cover-meta">
          <div>
            <dt>户名</dt>
            <dd>{state.profile.name}</dd>
          </div>
          <div>
            <dt>账号</dt>
            <dd>{book.accountNo}</dd>
          </div>
          <div>
            <dt>开户日期</dt>
            <dd>{formatCnDate(book.openedAt)}</dd>
          </div>
          <div>
            <dt>存款种类</dt>
            <dd>自律时长 · 定期存入</dd>
          </div>
        </dl>
        <div className="cover-balance">
          <div>
            <span className="cover-balance-label">存款余额</span>
            <div className="cover-balance-value">
              {formatCoins(balance)}
              <small>枚</small>
            </div>
          </div>
          <div className="cover-balance-note">
            每一笔专注
            <br />
            都有回执
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary cover-open"
          onClick={onOpen}
        >
          翻开存折
        </button>
        <div className="cover-foot">点击翻开 · 2026 华为开发者大赛</div>
      </div>
    </div>
  );
}