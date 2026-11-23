import { useState, type FormEvent } from 'react';
import { useApp } from '../store/AppStore';
import { formatCnDate } from '../lib/date';
import type { ToastTone } from './Toast';

interface Props {
  onClose: () => void;
  toast: (text: string, tone?: ToastTone) => void;
}

export function BookPanel({ onClose, toast }: Props) {
  const { state, book, actions } = useApp();
  const [newName, setNewName] = useState('');
  const [newGlyph, setNewGlyph] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) {
      toast('请填写新存折的名称', 'warn');
      return;
    }
    const created = actions.createBook(newName, newGlyph);
    toast(`已新建存折「${created.name}」，并切换过去`, 'ok');
    setNewName('');
    setNewGlyph('');
  };

  const handleDelete = (id: string, name: string) => {
    if (state.books.length <= 1) {
      toast('至少保留一本存折', 'warn');
      return;
    }
    if (confirmId !== id) {
      setConfirmId(id);
      window.setTimeout(() => {
        setConfirmId((current) => (current === id ? null : current));
      }, 3000);
      return;
    }
    actions.deleteBook(id);
    setConfirmId(null);
    toast(`已删除存折「${name}」`, 'warn');
  };

  return (
    <div className="dl-form-overlay" onMouseDown={onClose}>
      <div
        className="dl-form book-panel"
        role="dialog"
        aria-modal="true"
        aria-label="管理账本"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dl-form-head">
          <div>
            <h3>管理账本</h3>
            <p className="panel-sub" style={{ marginBottom: 0 }}>
              每个账本是一本独立存折：自律项目、硬币、奖励、流水、DDL
              与统计互不影响。
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="book-manager">
          {state.books.map((item) => (
            <div
              key={item.id}
              className={`book-manager-row${item.id === book.id ? ' is-active' : ''}`}
            >
              <input
                className="input book-glyph-input"
                maxLength={1}
                value={item.glyph}
                aria-label={`${item.name}的封面字`}
                onChange={(event) =>
                  actions.updateBookMeta(item.id, {
                    glyph: event.target.value.slice(0, 1) || '存',
                  })
                }
              />
              <div className="book-manager-main">
                <input
                  className="input"
                  value={item.name}
                  maxLength={12}
                  aria-label="账本名称"
                  onChange={(event) =>
                    actions.updateBookMeta(item.id, {
                      name: event.target.value,
                    })
                  }
                  onBlur={(event) => {
                    if (!event.target.value.trim()) {
                      actions.updateBookMeta(item.id, { name: '未命名存折' });
                    }
                  }}
                />
                <span className="mini-note">
                  {item.accountNo} · 开户 {formatCnDate(item.openedAt)} ·{' '}
                  {item.deadlines.length} 项 DDL
                </span>
              </div>
              <div className="book-manager-actions">
                {item.id === book.id ? (
                  <span className="tag tag-vermilion">使用中</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => actions.switchBook(item.id)}
                  >
                    切换
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  disabled={state.books.length <= 1}
                  onClick={() => handleDelete(item.id, item.name)}
                >
                  {confirmId === item.id ? '确认删除' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <form className="book-create" onSubmit={handleCreate}>
          <div className="section-sep">新建一本存折</div>
          <div className="book-create-row">
            <label className="field">
              <span>封面字</span>
              <input
                className="input book-glyph-input"
                maxLength={1}
                value={newGlyph}
                placeholder="研"
                onChange={(event) => setNewGlyph(event.target.value)}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>存折名称</span>
              <input
                className="input"
                maxLength={12}
                value={newName}
                placeholder="例如：考研存折、健身存折"
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              新建
            </button>
          </div>
          <p className="mini-note">
            新存折会获得 1 枚开户礼硬币，并自带默认自律项目与奖励。
          </p>
        </form>
      </div>
    </div>
  );
}