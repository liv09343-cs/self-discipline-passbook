import { useState } from 'react';
import {
  supabaseSync,
  type SupabaseStatus,
} from '../lib/supabaseSync';
import { useSupabaseSnapshot } from '../hooks/useSupabaseSync';
import { relativeTime } from '../lib/date';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
}

const STATUS_LABEL: Record<SupabaseStatus, string> = {
  checking: '检查配置中',
  unconfigured: '本机模式',
  ready: '已配置 · 未登录',
  signing: '登录中',
  syncing: '同步中',
  online: '云端已连接',
  offline: '云端离线',
  error: '同步出错',
};

export function SupabaseSyncPanel({ toast }: Props) {
  const cloud = useSupabaseSnapshot();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmForce, setConfirmForce] = useState(false);

  const guard = async (
    task: () => Promise<void>,
    success: string,
  ): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await task();
      toast(success, 'ok');
    } catch (caught) {
      const message =
        (caught as Error)?.message ||
        supabaseSync.getSnapshot().message ||
        '操作失败';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const value = email.trim();
    if (!value || !password) {
      setError('请填写邮箱与密码');
      return;
    }
    void (async () => {
      setBusy(true);
      setError('');
      try {
        if (mode === 'signin') {
          await supabaseSync.signIn(value, password);
          toast('登录成功，已开始云端同步', 'ok');
        } else {
          const result = await supabaseSync.signUp(value, password);
          if (result.needsConfirm) {
            toast('注册成功，请查收邮箱里的确认链接后再登录', 'warn');
            setMode('signin');
          } else {
            toast('注册成功，已开始云端同步', 'ok');
          }
        }
      } catch (caught) {
        const message =
          (caught as Error)?.message ||
          supabaseSync.getSnapshot().message ||
          '操作失败';
        setError(message);
        toast(message, 'error');
      } finally {
        setBusy(false);
      }
    })();
  };

  const syncNow = () => {
    void guard(() => supabaseSync.syncNow(), '双向同步完成');
  };

  const pullNow = () => {
    void guard(async () => {
      await supabaseSync.pullAndApply();
    }, '已从云端拉取最新数据');
  };

  const forcePull = () => {
    if (!confirmForce) {
      setConfirmForce(true);
      window.setTimeout(() => setConfirmForce(false), 3000);
      return;
    }
    setConfirmForce(false);
    void guard(async () => {
      await supabaseSync.pullAndApply(true);
    }, '已用云端数据覆盖本机');
  };

  const signOut = () => {
    void guard(() => supabaseSync.signOut(), '已退出云端账号，本机数据保留');
  };

  return (
    <section className="data-block cloud-block">
      <div className="cloud-head">
        <h4>云端同步（Supabase）</h4>
        <span className={`cloud-status is-${cloud.status}`}>
          <span className="cloud-dot" />
          {STATUS_LABEL[cloud.status]}
        </span>
      </div>
      <p className="mini-note">{cloud.message}</p>

      {!cloud.configured && (
        <>
          <div className="cloud-guide">
            <div className="cloud-guide-title">三步接入</div>
            <div>1. 在 supabase.com 创建项目</div>
            <div>
              2. 在 SQL Editor 执行项目里的 <code>supabase/schema.sql</code>
            </div>
            <div>
              3. 把 Project URL 与 anon key 写入{' '}
              <code>public/supabase-config.json</code>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => void supabaseSync.init(true)}
          >
            重新检测配置
          </button>
        </>
      )}

      {cloud.configured && !cloud.user && (
        <div className="cloud-form">
          <div className="cloud-tabs">
            <button
              type="button"
              className={`cloud-tab${mode === 'signin' ? ' is-active' : ''}`}
              onClick={() => setMode('signin')}
            >
              登录
            </button>
            <button
              type="button"
              className={`cloud-tab${mode === 'signup' ? ' is-active' : ''}`}
              onClick={() => setMode('signup')}
            >
              注册
            </button>
          </div>
          <div className="cloud-fields">
            <label className="field">
              <span>邮箱</span>
              <input
                className="input"
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>密码</span>
              <input
                className="input"
                type="password"
                value={password}
                placeholder="至少 6 位"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={submit}
            >
              {busy
                ? '处理中…'
                : mode === 'signin'
                  ? '登录并同步'
                  : '注册并同步'}
            </button>
          </div>
          <p className="mini-note" style={{ marginTop: 8 }}>
            Supabase 默认会发送邮箱确认链接。演示时可在 Authentication →
            Providers → Email 里关闭 Confirm email，注册后即可直接登录。
          </p>
        </div>
      )}

      {cloud.user && (
        <>
          <div className="cloud-account">
            <div>
              <div className="cloud-account-mail">
                {cloud.user.email || '已登录'}
              </div>
              <div className="mini-note">
                UID {cloud.user.uid.slice(0, 8).toUpperCase()}
                {cloud.lastSyncAt
                  ? ` · 上次同步 ${relativeTime(cloud.lastSyncAt)}`
                  : ''}
              </div>
            </div>
            <span className="tag tag-green">多端同步</span>
          </div>
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={syncNow}
            >
              {busy ? '同步中…' : '立即双向同步'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={pullNow}
            >
              从云端拉取
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger-ghost"
              disabled={busy}
              onClick={signOut}
            >
              退出登录
            </button>
          </div>
          <div className="form-actions" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-sm btn-danger-ghost"
              disabled={busy}
              onClick={forcePull}
            >
              {confirmForce ? '再点一次确认覆盖' : '以云端覆盖本机'}
            </button>
            <span className="mini-note">
              本机数据混乱时，用云端版本强制对齐
            </span>
          </div>
          <p className="mini-note" style={{ marginTop: 8 }}>
            自动同步：本机改动约 2 秒后上传；每 2 分钟或切回页面时拉取一次云端更新。
          </p>
        </>
      )}

      {error && <div className="ocr-error">{error}</div>}
    </section>
  );
}