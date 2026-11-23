import type { AppState, Book } from '../types';
import { uid } from './date';

const APP_TAG = 'self-passbook';
const CODE_PREFIX = 'SPB1.';
const RAW_PREFIX = 'SPB0.';

export function emptyTimer(): Book['timer'] {
  return {
    subjectId: null,
    running: false,
    startedAt: null,
    accumulatedMs: 0,
    targetMinutes: null,
  };
}

export function makeDeviceId(): string {
  return uid();
}

export function buildBackup(state: AppState): string {
  return JSON.stringify(
    {
      app: APP_TAG,
      version: 2,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}

export function backupFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `自律存折-备份-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export function downloadBackup(state: AppState): void {
  const blob = new Blob([buildBackup(state)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function runTransform(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const source = new Blob([toArrayBuffer(bytes)]).stream();
  const stream = source.pipeThrough(
    transform as unknown as TransformStream<Uint8Array, Uint8Array>,
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeSyncCode(state: AppState): Promise<string> {
  const json = JSON.stringify({
    app: APP_TAG,
    version: 2,
    exportedAt: new Date().toISOString(),
    state,
  });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const compressed = await runTransform(bytes, new CompressionStream('gzip'));
    return CODE_PREFIX + bytesToBase64(compressed);
  }
  return RAW_PREFIX + bytesToBase64(bytes);
}

export async function decodeSyncCode(code: string): Promise<AppState> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error('同步码为空');
  if (trimmed.startsWith(CODE_PREFIX)) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前浏览器不支持解压同步码，请改用备份文件导入');
    }
    const compressed = base64ToBytes(trimmed.slice(CODE_PREFIX.length));
    const raw = await runTransform(
      compressed,
      new DecompressionStream('gzip'),
    );
    return readPayload(new TextDecoder().decode(raw));
  }
  if (trimmed.startsWith(RAW_PREFIX)) {
    const raw = base64ToBytes(trimmed.slice(RAW_PREFIX.length));
    return readPayload(new TextDecoder().decode(raw));
  }
  return readPayload(trimmed);
}

function readPayload(json: string): AppState {
  const parsed = JSON.parse(json);
  return validateState(parsed && parsed.state ? parsed.state : parsed);
}

export function parseBackup(text: string): AppState {
  const parsed = JSON.parse(text);
  const state = parsed && parsed.state ? parsed.state : parsed;
  return validateState(state);
}

function normalizeBook(input: Record<string, unknown>): Book {
  const name = typeof input.name === 'string' ? input.name : '未命名存折';
  return {
    id: typeof input.id === 'string' ? input.id : uid(),
    name,
    glyph:
      typeof input.glyph === 'string' && input.glyph
        ? input.glyph.slice(0, 1)
        : name.slice(0, 1),
    accountNo:
      typeof input.accountNo === 'string' ? input.accountNo : 'NO. ----',
    openedAt:
      typeof input.openedAt === 'string'
        ? input.openedAt
        : new Date().toISOString(),
    motto: typeof input.motto === 'string' ? input.motto : '',
    subjects: Array.isArray(input.subjects) ? input.subjects : [],
    timer:
      input.timer && typeof input.timer === 'object'
        ? { ...emptyTimer(), ...(input.timer as Book['timer']) }
        : emptyTimer(),
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
    ledger: Array.isArray(input.ledger) ? input.ledger : [],
    rewards: Array.isArray(input.rewards) ? input.rewards : [],
    deadlines: Array.isArray(input.deadlines) ? input.deadlines : [],
  } as Book;
}

export function validateState(input: unknown): AppState {
  if (!input || typeof input !== 'object') {
    throw new Error('备份内容不是有效的存折数据');
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.books) || raw.books.length === 0) {
    throw new Error('备份中没有账本数据');
  }
  const books = raw.books
    .filter(
      (book): book is Record<string, unknown> =>
        Boolean(book) && typeof book === 'object',
    )
    .map(normalizeBook);
  if (books.length === 0) {
    throw new Error('账本数据格式不正确');
  }
  const profile =
    raw.profile && typeof raw.profile === 'object'
      ? (raw.profile as Record<string, unknown>)
      : {};
  const activeBookId =
    typeof raw.activeBookId === 'string' &&
    books.some((book) => book.id === raw.activeBookId)
      ? raw.activeBookId
      : books[0].id;
  const settings =
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as Record<string, unknown>)
      : {};
  return {
    version: 2,
    profile: {
      name: typeof profile.name === 'string' ? profile.name : '同学',
      deviceId:
        typeof profile.deviceId === 'string' ? profile.deviceId : uid(),
    },
    activeBookId,
    books,
    settings: {
      coinsPerHourDefault:
        typeof settings.coinsPerHourDefault === 'number'
          ? settings.coinsPerHourDefault
          : 1,
      minSessionMinutes:
        typeof settings.minSessionMinutes === 'number'
          ? settings.minSessionMinutes
          : 5,
    },
    lastBackupAt:
      typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : null,
  };
}