import { useEffect, useState } from 'react';
import { agcSync, type AgcStatus } from '../lib/agcSync';
import { useAgcSnapshot } from '../hooks/useAgcSync';
import { relativeTime } from '../lib/date';
import type { ToastTone } from './Toast';

interface Props {
  toast: (text: string, tone?: ToastTone) => void;
}

const STATUS_LABEL: Record<AgcStatus, string> = {
  checking: '检查配置中',
  unconfigured: '本机模式',
  ready: '已配置 · 未登录',
  signing: '登录中',
  syncing: '同步中',
  online: '云端已连接',
  offline: '云端离线',
  error: '同步出错',
};

export function CloudSyncPanel({ toast }: Props) {
  const agc = useAgcSnapshot();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

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
        (caught as Error)?.message || agcSync.getSnapshot().message || '操作失败';
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
    if (mode === 'signup' && !verifyCode.trim()) {
      setError('请填写邮箱验证码');
      return;
    }
    void guard(
      () =>
        mode === 'signin'
          ? agcSync.signIn(value, password)
          : agcSync.signUp(value, password, verifyCode.trim()),
      mode === 'signin' ? '登录成功，已开始云端同步' : '注册成功，已开始云端同步',
    );
  };

  const sendCode = () => {
    const value = email.trim();
    if (!value) {
      setError('请先填写邮箱');
      return;
    }
    void guard(async () => {
      await agcSync.sendEmailCode(value);
      setCooldown(60);
    }, '验证码已发送，请查收邮箱');
  };

  const syncNow = () => {
    void guard(() => agcSync.syncNow(), '双向同步完成');
  };

  const pullNow = () => {
    void guard(async () => {
      await agcSync.pullAndApply();
    }, '已从云端拉取最新数据');
  };

  const signOut = () => {
    void guard(() => agcSync.signOut(), '已退出云端账号，本机数据保留');
  };

  return (
    <section className="data-block cloud-block">
      <div className="cloud-head">
        <h4>华为云同步（AGC）</h4>
        <span className={`cloud-status is-${agc.status}`}>
          <span className="cloud-dot" />
          {STATUS_LABEL[agc.status]}
        </span>
      </div>
      <p className="mini-note">{agc.message}</p>

      {!agc.configured && (
        <>
          <div className="cloud-guide">
            <div className="cloud-guide-title">三步接入</div>
            <div>1. AGC 创建 Web 应用，开通「认证服务」与「云数据库」</div>
            <div>
              2. 把下载的 agconnect-services.json 复制为{' '}
              <code>public/agc-config.json</code>
            </div>
            <div>
              3. 从云数据库导出对象类型，保存为{' '}
              <code>public/agc-schema.json</code>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => void agcSync.init(true)}
          >
            重新检测配置
          </button>
        </>
      )}

      {agc.configured && !agc.user && (
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
                placeholder="至少 8 位"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === 'signup' && (
              <div className="cloud-code-row">
                <label className="field" style={{ flex: 1 }}>
                  <span>邮箱验证码</span>
                  <input
                    className="input"
                    value={verifyCode}
                    placeholder="6 位验证码"
                    onChange={(event) => setVerifyCode(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || cooldown > 0}
                  onClick={sendCode}
                >
                  {cooldown > 0 ? `${cooldown}s` : '发送验证码'}
                </button>
              </div>
            )}
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
            登录后本机账本会上传到云端；在另一台设备登录同一邮箱，即可拉取同一套存折。
          </p>
        </div>
      )}

      {agc.user && (
        <>
          <div className="cloud-account">
            <div>
              <div className="cloud-account-mail">
                {agc.user.email || '已登录'}
              </div>
              <div className="mini-note">
                UID {agc.user.uid.slice(0, 8).toUpperCase()}
                {agc.lastSyncAt
                  ? ` · 上次同步 ${relativeTime(agc.lastSyncAt)}`
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
          <p className="mini-note" style={{ marginTop: 8 }}>
            自动同步：本机改动会在约 2 秒后上传；每 2 分钟或切回页面时拉取一次云端更新。
          </p>
        </>
      )}

      {agc.missingSchema && agc.configured && (
        <div className="ocr-error">
          缺少对象类型 schema，云端读写可能失败：请从 AGC 云数据库导出对象类型 JSON，保存为
          public/agc-schema.json。
        </div>
      )}

      {error && <div className="ocr-error">{error}</div>}
    </section>
  );
}