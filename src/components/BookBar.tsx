import { useApp } from '../store/AppStore';

interface Props {
  onOpenManage: () => void;
  onOpenData: () => void;
}

export function BookBar({ onOpenManage, onOpenData }: Props) {
  const { state, book, actions } = useApp();

  return (
    <div className="book-bar">
      <div className="book-bar-group">
        <span className="book-bar-label">存折册</span>
        <div className="book-tabs">
          {state.books.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`book-tab${item.id === book.id ? ' is-active' : ''}`}
              title={item.motto || item.name}
              onClick={() => actions.switchBook(item.id)}
            >
              <span className="book-tab-glyph">{item.glyph}</span>
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="book-bar-actions">
        <button type="button" className="btn btn-sm" onClick={onOpenManage}>
          管理账本
        </button>
        <button type="button" className="btn btn-sm" onClick={onOpenData}>
          数据与同步
        </button>
      </div>
    </div>
  );
}