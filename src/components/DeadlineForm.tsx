import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import type { Deadline, DdlCategory } from '../types';
import { CATEGORY_META, REMIND_OPTIONS } from '../types';
import { useApp } from '../store/AppStore';
import { fromInputs, toDateInput, toTimeInput } from '../lib/date';
import {
  recognizeImage,
  parseDeadlineText,
  type OcrProgress,
} from '../lib/ocr';
import type { ToastTone } from './Toast';

interface Props {
  initial: Deadline | null;
  defaultDate: Date;
  onClose: () => void;
  toast: (text: string, tone?: ToastTone) => void;
}

const MAX_SIZE = 8 * 1024 * 1024;

export function DeadlineForm({ initial, defaultDate, onClose, toast }: Props) {
  const { actions } = useApp();
  const baseDate = initial ? new Date(initial.dueAt) : defaultDate;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(toDateInput(baseDate));
  const [time, setTime] = useState(
    initial ? toTimeInput(new Date(initial.dueAt)) : '23:59',
  );
  const [category, setCategory] = useState<DdlCategory>(
    initial?.category ?? 'homework',
  );
  const [remind, setRemind] = useState(initial?.remindBeforeMin ?? 60);
  const [note, setNote] = useState(initial?.note ?? '');
  const [pasteText, setPasteText] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({
    status: '',
    progress: 0,
  });
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const applyParsed = (text: string) => {
    const parsed = parseDeadlineText(text);
    setTitle(parsed.title);
    if (parsed.dueAt) {
      const due = new Date(parsed.dueAt);
      setDate(toDateInput(due));
      setTime(toTimeInput(due));
    }
    setCategory(parsed.category);
    return parsed;
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件（PNG / JPG）', 'warn');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast('图片过大，请压缩到 8MB 以内', 'warn');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setOcrBusy(true);
    setOcrError('');
    setOcrText('');
    setOcrProgress({ status: '准备中', progress: 0 });
    try {
      const text = await recognizeImage(file, setOcrProgress);
      setOcrText(text.trim());
      if (!text.trim()) {
        setOcrError('没有识别到文字，请换一张更清晰的截图，或直接粘贴文字解析。');
      } else {
        applyParsed(text);
        toast('图片识别完成，已自动填入，请核对后保存', 'ok');
      }
    } catch {
      setOcrError(
        '识读引擎加载失败（通常需要联网首次加载中文模型）。可把通知文字粘贴到下方文本框，用「智能解析文字」继续。',
      );
    } finally {
      setOcrBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const parsePaste = () => {
    if (!pasteText.trim()) {
      toast('请先粘贴通知文字', 'warn');
      return;
    }
    const parsed = applyParsed(pasteText);
    toast(
      parsed.dueAt
        ? '已解析出时间与标题，请核对'
        : '未识别到明确日期，已按明天 23:59 填入，请手动调整',
      parsed.dueAt ? 'ok' : 'warn',
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast('请填写 DDL 标题', 'warn');
      return;
    }
    if (!date) {
      toast('请选择截止日期', 'warn');
      return;
    }
    const dueAt = fromInputs(date, time || '23:59');
    if (initial) {
      actions.updateDeadline(initial.id, {
        title: title.trim(),
        dueAt,
        category,
        remindBeforeMin: remind,
        note: note.trim(),
      });
      toast('DDL 已更新', 'ok');
    } else {
      actions.addDeadline({
        title,
        dueAt,
        category,
        remindBeforeMin: remind,
        note,
        source: ocrText ? 'ocr' : 'manual',
      });
      toast('DDL 已加入日历，可导出 .ics 交给系统提醒', 'ok');
    }
    onClose();
  };

  const handleDelete = () => {
    if (!initial) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    actions.removeDeadline(initial.id);
    toast('已删除该 DDL', 'warn');
    onClose();
  };

  return (
    <div className="dl-form-overlay" onMouseDown={onClose}>
      <div
        className="dl-form"
        role="dialog"
        aria-modal="true"
        aria-label={initial ? '编辑 DDL' : '添加 DDL'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dl-form-head">
          <div>
            <h3>{initial ? '编辑 DDL' : '添加 DDL'}</h3>
            <p className="panel-sub" style={{ marginBottom: 0 }}>
              可以直接填写，也可以从图片或通知文字中识读。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="ocr-zone">
          <div
            className={`ocr-drop${dragging ? ' is-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                inputRef.current?.click();
              }
            }}
          >
            <span className="ocr-drop-glyph">⇪</span>
            <span className="ocr-drop-text">
              {ocrBusy ? '正在识读图片…' : '上传考试通知 / 群消息截图'}
            </span>
            <small>点击选择或拖入图片 · 自动识读中文与日期</small>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />

          {ocrBusy && (
            <div className="ocr-progress">
              <div className="ocr-progress-head">
                <span>{ocrProgress.status || '正在识读'}</span>
                <span>{Math.round(ocrProgress.progress * 100)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(ocrProgress.progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {preview && !ocrBusy && (
            <div className="ocr-preview">
              <img src={preview} alt="已上传的 DDL 截图" />
              <div className="ocr-preview-text">
                {ocrText || '已完成识读，请核对下方字段。'}
              </div>
            </div>
          )}

          {ocrError && <div className="ocr-error">{ocrError}</div>}

          <p className="ocr-hint">
            识别模型在首次使用时加载，需要联网；若网络受限，可直接把通知文字粘贴到下方。
          </p>
        </div>

        <label className="field" style={{ marginBottom: 12 }}>
          <span>粘贴通知文字（可选）</span>
          <textarea
            className="textarea"
            value={pasteText}
            placeholder="例如：高数期中考试定于 6 月 18 日下午 2:00 在 B203 举行"
            onChange={(event) => setPasteText(event.target.value)}
          />
        </label>
        <div className="form-actions" style={{ marginTop: -4, marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={parsePaste}
            disabled={!pasteText.trim()}
          >
            智能解析文字
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field span-2">
              <span>DDL 标题</span>
              <input
                className="input"
                value={title}
                maxLength={40}
                placeholder="例如：数据结构课程设计答辩"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field">
              <span>截止日期</span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>截止时间</span>
              <input
                className="input"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
            <label className="field">
              <span>类别</span>
              <select
                className="select"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as DdlCategory)
                }
              >
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>提醒时间</span>
              <select
                className="select"
                value={remind}
                onChange={(event) => setRemind(Number(event.target.value))}
              >
                {REMIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span>备注（可选）</span>
              <textarea
                className="textarea"
                value={note}
                maxLength={120}
                placeholder="地点、提交方式、要带的东西…"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>

          <div className="form-actions" style={{ marginTop: 18 }}>
            <button type="submit" className="btn btn-primary">
              {initial ? '保存修改' : '保存 DDL'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            {initial && (
              <button
                type="button"
                className="btn btn-sm btn-danger-ghost"
                style={{ marginLeft: 'auto' }}
                onClick={handleDelete}
              >
                {confirmDelete ? '再点一次确认删除' : '删除此 DDL'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}