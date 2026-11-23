import { useCallback, useState } from 'react';

export type ToastTone = 'ok' | 'warn' | 'error';

export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  return { items, push };
}

export function ToastStack({ items }: { items: ToastItem[] }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast is-${item.tone}`}>
          <span aria-hidden="true">
            {item.tone === 'ok' ? '●' : item.tone === 'warn' ? '▲' : '■'}
          </span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}