import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID) as
    | HTMLScriptElement
    | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Turnstile 加载失败')),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile 加载失败'));
    document.head.appendChild(script);
  });
}

interface Props {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire: () => void;
}

export function TurnstileWidget({ siteKey, onToken, onExpire }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const [error, setError] = useState('');

  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onExpireRef.current(),
          'error-callback': () =>
            setError('人机验证失败，请刷新页面重试'),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError('人机验证加载失败，请检查网络或广告拦截设置');
        }
      });

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [siteKey]);

  return (
    <div className="turnstile-wrap">
      <div ref={containerRef} />
      {error && <div className="ocr-error">{error}</div>}
    </div>
  );
}