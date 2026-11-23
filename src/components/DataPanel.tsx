import { useEffect, useState } from 'react';
import { useApp } from '../store/AppStore';
import {
  decodeSyncCode,
  downloadBackup,
  encodeSyncCode,
  parseBackup,
} from '../lib/sync';
import { relativeTime } from '../lib/date';
import { SupabaseSyncPanel } from './SupabaseSyncPanel';
import type { ToastTone } from './Toast';

interface Props {
  onClose: () => void;
  toast: (text: string, tone?: ToastTone) => void;
}

export function DataPanel({ onClose, toast }: Props) {
  const { state, actions } = useApp();
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const exportBackup = () => {
    downloadBackup(state);
    actions.markBackup();
    toast('备份文件已导出，可在另一台设备导入', 'ok');
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const text = await file.text();
      const next = parseBackup(text);
      actions.replaceState(next);
      toast(`已导入 ${next.books.length} 本存折`, 'ok');
      onClose();
    } catch (error) {
      toast(`导入失败：${(error as Error).message}`, 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const generateCode = async () => {
    setCodeBusy(true);
    try {
      setCode(await encodeSyncCode(state));
      toast('同步码已生成，复制到另一台设备粘贴导入', 'ok');
    } catch {
      toast('同步码生成失败，请改用备份文件', 'error');
    } finally {
      setCodeBusy(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast('同步码已复制到剪贴板', 'ok');
    } catch {
      toast('复制失败，请手动全选复制', 'warn');
    }
  };

  const importCode = async () => {
    if (!paste.trim()) {
      toast('请先粘贴同步码', 'warn');
      return;
    }
    setImportBusy(true);
    try {
      const next = await decodeSyncCode(paste);
      actions.replaceState(next);
      toast(`已从同步码导入 ${next.books.length} 本存折`, 'ok');
      onClose();
    } catch (error) {
      toast(`同步码无效：${(error as Error).message}`, 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    actions.resetAll();
    toast('已恢复为演示数据', 'warn');
    onClose();
  };

  return (
    <div className="dl-form-overlay" onMouseDown={onClose}>
      <div
        className="dl-form data-panel"
        role="dialog"
        aria-modal="true"
        aria-label="数据与同步"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dl-form-head">
          <div>
            <h3>数据与同步</h3>
            <p className="panel-sub" style={{ marginBottom: 0 }}>
              本机模式：数据保存在当前浏览器。用备份文件或同步码，可迁移到手机、电脑等其他设备。
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <section className="data-block">
          <h4>本机档案</h4>
          <div className="data-rows">
            <span>设备编号</span>
            <span className="mono-num">
              {state.profile.deviceId.slice(0, 8).toUpperCase()}
            </span>
            <span>账本数量</span>
            <span>{state.books.length} 本</span>
            <span>最近备份</span>
            <span>
              {state.lastBackupAt ? relativeTime(state.lastBackupAt) : '尚未备份'}
            </span>
          </div>
        </section>

        <section className="data-block">
          <h4>备份文件</h4>
          <p className="mini-note">
            导出包含全部账本的 JSON 文件；在另一台设备选择该文件导入，即可完整恢复。
          </p>
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={exportBackup}>
              导出备份
            </button>
            <label className={`btn${importBusy ? ' is-disabled' : ''}`}>
              {importBusy ? '导入中…' : '导入备份'}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={importBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </section>

        <section className="data-block">
          <h4>同步码</h4>
          <p className="mini-note">
            生成一串可复制的文本，在手机上粘贴导入即可完成一次跨设备同步。导入会覆盖本机全部账本。
          </p>
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={generateCode}
              disabled={codeBusy}
            >
              {codeBusy ? '生成中…' : '生成同步码'}
            </button>
            {code && (
              <button type="button" className="btn" onClick={copyCode}>
                复制同步码
              </button>
            )}
          </div>
          {code && (
            <textarea
              className="textarea code-box"
              readOnly
              value={code}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
          <div className="section-sep">或从另一台设备导入</div>
          <textarea
            className="textarea code-box"
            value={paste}
            placeholder="把另一台设备生成的同步码粘贴到这里"
            onChange={(event) => setPaste(event.target.value)}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={importCode}
              disabled={importBusy || !paste.trim()}
            >
              导入同步码
            </button>
          </div>
        </section>

        <SupabaseSyncPanel toast={toast} />

        <section className="data-block danger-zone">
          <h4>重置数据</h4>
          <p className="mini-note">
            会删除本机全部账本与记录，并恢复为演示数据。建议先导出备份。
          </p>
          <button
            type="button"
            className="btn btn-danger"
            style={{ marginTop: 8 }}
            onClick={reset}
          >
            {confirmReset ? '再点一次确认重置' : '恢复演示数据'}
          </button>
        </section>
      </div>
    </div>
  );
}