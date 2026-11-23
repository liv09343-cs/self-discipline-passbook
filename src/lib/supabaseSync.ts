import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState, Book } from '../types';
import { emptyTimer } from './sync';

const CONFIG_FILE = 'supabase-config.json';
const POLL_INTERVAL = 120000;
const PUSH_DEBOUNCE = 1500;

export type SupabaseStatus =
  | 'checking'
  | 'unconfigured'
  | 'ready'
  | 'signing'
  | 'syncing'
  | 'online'
  | 'offline'
  | 'error';

export interface SupabaseUserInfo {
  uid: string;
  email: string;
}

export interface SupabaseSnapshot {
  status: SupabaseStatus;
  configured: boolean;
  user: SupabaseUserInfo | null;
  message: string;
  lastSyncAt: string | null;
}

export interface SignUpResult {
  needsConfirm: boolean;
}

interface BookRow {
  owner: string;
  id: string;
  book: Book | null;
  revision: number;
  updated_at: number;
  device_id: string;
  deleted: boolean;
}

interface AccountRow {
  owner: string;
  profile: { name?: string } | null;
  settings: Record<string, unknown> | null;
  revision: number;
  updated_at: number;
  device_id: string;
}

interface RemoteBookMeta {
  revision: number;
  updatedAt: number;
  bookJson: string;
  deleted: boolean;
}

interface RemoteAccountMeta {
  revision: number;
  profileJson: string;
  settingsJson: string;
}

interface MergeResult {
  state: AppState;
  changed: boolean;
}

function describeError(error: unknown): string {
  if (!error) return '未知错误';
  const value = error as {
    message?: string;
    error_description?: string;
    status?: number;
  };
  return (
    value.error_description ??
    value.message ??
    String(error)
  );
}

function stripTimer(book: Book): Book {
  return { ...book, timer: emptyTimer() };
}

function parseBook(value: unknown): Book | null {
  if (!value || typeof value !== 'object') return null;
  const book = value as Book;
  if (typeof book.id !== 'string' || typeof book.name !== 'string') {
    return null;
  }
  return book;
}

function parseRemoteBook(json: string): Book | null {
  if (!json) return null;
  try {
    return parseBook(JSON.parse(json));
  } catch {
    return null;
  }
}

class SupabaseSyncService {
  private snapshot: SupabaseSnapshot = {
    status: 'checking',
    configured: false,
    user: null,
    message: '正在检查 Supabase 配置',
    lastSyncAt: null,
  };
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  private client: SupabaseClient | null = null;
  private config: { url: string; anonKey: string } | null = null;
  private uid = '';
  private deviceId = '';
  private lastState: AppState | null = null;
  private remoteBooks = new Map<string, RemoteBookMeta>();
  private remoteAccount: RemoteAccountMeta | null = null;
  private initialized = false;
  private dirty = false;
  private pushTimer: number | null = null;
  private pollTimer: number | null = null;
  private visibilityBound = false;
  private getState: (() => AppState) | null = null;
  private applyRemote: ((state: AppState) => void) | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SupabaseSnapshot => this.snapshot;

  attach(options: {
    getState: () => AppState;
    applyRemote: (state: AppState) => void;
  }): void {
    this.getState = options.getState;
    this.applyRemote = options.applyRemote;
  }

  detach(): void {
    this.stopPolling();
    if (this.pushTimer) {
      window.clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
  }

  private setSnapshot(patch: Partial<SupabaseSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async init(force = false): Promise<void> {
    if (force && this.snapshot.status === 'unconfigured') {
      this.initPromise = null;
    }
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.setSnapshot({
      status: 'checking',
      message: '正在检查 Supabase 配置',
    });
    const config = await this.loadJson(CONFIG_FILE);
    if (!config || !config.url) {
      this.setSnapshot({
        status: 'unconfigured',
        configured: false,
        message: '未找到 supabase-config.json，当前为本机模式',
      });
      return;
    }
    const key = config.key ?? config.anonKey ?? config.publishableKey;
    if (!key) {
      this.setSnapshot({
        status: 'unconfigured',
        configured: false,
        message: 'supabase-config.json 缺少 Publishable key',
      });
      return;
    }
    try {
      this.config = {
        url: String(config.url),
        anonKey: String(key),
      };
      const { createClient } = await import('@supabase/supabase-js');
      const client = createClient(this.config.url, this.config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      this.client = client;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session?.user) {
        await this.restoreSession(data.session.user);
      } else {
        this.setSnapshot({
          status: 'ready',
          configured: true,
          user: null,
          message: 'Supabase 已配置，登录后开始多端同步',
        });
      }
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        configured: true,
        message: `Supabase 初始化失败：${describeError(error)}`,
      });
    }
  }

  private async loadJson(file: string): Promise<any | null> {
    try {
      const url = new URL(file, document.baseURI);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Supabase 尚未初始化');
    return this.client;
  }

  private async restoreSession(user: {
    id: string;
    email?: string;
  }): Promise<void> {
    this.uid = user.id;
    const info = { uid: user.id, email: user.email ?? '' };
    this.setSnapshot({
      status: 'online',
      configured: true,
      user: info,
      message: '已恢复登录，正在同步',
    });
    try {
      this.startPolling();
      await this.pullAndApply();
      const current = this.lastState ?? this.getState?.();
      if (current) await this.pushState(current);
    } catch (error) {
      this.setSnapshot({
        status: 'offline',
        user: info,
        message: `同步失败：${describeError(error)}`,
      });
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.init();
    const client = this.requireClient();
    this.setSnapshot({ status: 'signing', message: '正在登录…' });
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.user) throw new Error('登录失败：未返回用户信息');
      await this.finishAuth(data.user);
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        message: `登录失败：${describeError(error)}`,
      });
      throw error;
    }
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    await this.init();
    const client = this.requireClient();
    this.setSnapshot({ status: 'signing', message: '正在注册…' });
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      if (error) throw error;
      if (!data.session || !data.user) {
        this.setSnapshot({
          status: 'ready',
          configured: true,
          user: null,
          message: '注册成功，请到邮箱点击确认链接后再登录',
        });
        return { needsConfirm: true };
      }
      await this.finishAuth(data.user);
      return { needsConfirm: false };
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        message: `注册失败：${describeError(error)}`,
      });
      throw error;
    }
  }

  private async finishAuth(user: {
    id: string;
    email?: string;
  }): Promise<void> {
    this.dirty = false;
    this.initialized = false;
    const before = this.getState?.();
    this.deviceId = before?.profile.deviceId ?? '';
    const info = { uid: user.id, email: user.email ?? '' };
    this.uid = user.id;
    this.setSnapshot({
      status: 'online',
      configured: true,
      user: info,
      message: '登录成功，正在同步',
    });
    try {
      this.startPolling();
      await this.pullAndApply();
      const current = this.lastState ?? this.getState?.();
      if (current) await this.pushState(current);
    } catch (error) {
      this.setSnapshot({
        status: 'offline',
        user: info,
        message: `已登录，但同步失败：${describeError(error)}`,
      });
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.client) await this.client.auth.signOut();
    } catch {
      // 忽略登出失败
    }
    this.stopPolling();
    this.uid = '';
    this.lastState = null;
    this.remoteBooks.clear();
    this.remoteAccount = null;
    this.initialized = false;
    this.dirty = false;
    this.setSnapshot({
      status: this.config ? 'ready' : 'unconfigured',
      configured: Boolean(this.config),
      user: null,
      message: '已退出云端账号',
    });
  }

  private async fetchRemote(): Promise<void> {
    const client = this.requireClient();
    const { data: books, error: bookError } = await client
      .from('passbook_book')
      .select('owner,id,book,revision,updated_at,device_id,deleted')
      .eq('owner', this.uid);
    if (bookError) throw new Error(bookError.message);
    this.remoteBooks.clear();
    ((books ?? []) as BookRow[]).forEach((row) => {
      this.remoteBooks.set(row.id, {
        revision: Number(row.revision) || 0,
        updatedAt: Number(row.updated_at) || 0,
        bookJson: row.book ? JSON.stringify(row.book) : '',
        deleted: Boolean(row.deleted),
      });
    });

    const { data: account, error: accountError } = await client
      .from('passbook_account')
      .select('owner,profile,settings,revision,updated_at,device_id')
      .eq('owner', this.uid)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    this.remoteAccount = account
      ? {
          revision: Number((account as AccountRow).revision) || 0,
          profileJson: JSON.stringify((account as AccountRow).profile ?? {}),
          settingsJson: JSON.stringify((account as AccountRow).settings ?? {}),
        }
      : null;
  }

  private mergeRemote(local: AppState): MergeResult {
    let changed = false;
    const books: Book[] = [];
    const seen = new Set<string>();

    local.books.forEach((localBook) => {
      seen.add(localBook.id);
      const remote = this.remoteBooks.get(localBook.id);
      if (!remote) {
        books.push(localBook);
        return;
      }
      if (remote.deleted) {
        changed = true;
        return;
      }
      const localJson = JSON.stringify(stripTimer(localBook));
      if (remote.bookJson === localJson) {
        books.push(localBook);
        return;
      }
      if (this.dirty && this.initialized) {
        books.push(localBook);
        return;
      }
      const remoteBook = parseRemoteBook(remote.bookJson);
      if (remoteBook) {
        books.push({ ...remoteBook, timer: localBook.timer });
        changed = true;
      } else {
        books.push(localBook);
      }
    });

    this.remoteBooks.forEach((remote, id) => {
      if (seen.has(id) || remote.deleted) return;
      if (this.dirty && this.initialized) return;
      const remoteBook = parseRemoteBook(remote.bookJson);
      if (remoteBook) {
        books.push({ ...remoteBook, timer: emptyTimer() });
        changed = true;
      }
    });

    let profileName = local.profile.name;
    let settings = local.settings;
    if (this.remoteAccount && !(this.dirty && this.initialized)) {
      try {
        const profile = JSON.parse(this.remoteAccount.profileJson);
        if (profile && typeof profile.name === 'string') {
          profileName = profile.name;
          if (profileName !== local.profile.name) changed = true;
        }
        const remoteSettings = JSON.parse(this.remoteAccount.settingsJson);
        if (remoteSettings && typeof remoteSettings === 'object') {
          settings = { ...local.settings, ...remoteSettings };
          if (JSON.stringify(settings) !== JSON.stringify(local.settings)) {
            changed = true;
          }
        }
      } catch {
        // 忽略损坏的账户配置
      }
    }

    const activeBookId = books.some((book) => book.id === local.activeBookId)
      ? local.activeBookId
      : books[0]?.id ?? local.activeBookId;

    const state: AppState = {
      ...local,
      profile: { ...local.profile, name: profileName },
      settings,
      books: books.length > 0 ? books : local.books,
      activeBookId,
    };
    return { state, changed };
  }

  async pullAndApply(force = false): Promise<boolean> {
    if (!this.client || !this.uid) return false;
    if (!force && this.dirty && this.initialized) {
      this.setSnapshot({
        status: 'online',
        message: '本地有新改动，稍后自动同步',
      });
      return false;
    }
    if (force) this.dirty = false;
    this.setSnapshot({ status: 'syncing', message: '正在从云端拉取…' });
    try {
      await this.fetchRemote();
      const local = this.getState?.();
      if (!local) {
        this.setSnapshot({ status: 'online', message: '等待账本加载' });
        return false;
      }
      const merged = this.mergeRemote(local);
      this.lastState = merged.state;
      this.initialized = true;
      if (merged.changed) this.applyRemote?.(merged.state);
      this.setSnapshot({
        status: 'online',
        message: merged.changed ? '已拉取云端更新' : '云端已是最新',
      });
      return merged.changed;
    } catch (error) {
      this.setSnapshot({
        status: 'offline',
        message: `拉取失败：${describeError(error)}`,
      });
      return false;
    }
  }

  queuePush(state: AppState): void {
    if (this.snapshot.status !== 'online' || !this.initialized) return;
    this.deviceId = state.profile.deviceId;
    this.dirty = true;
    if (this.pushTimer) window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => {
      const current = this.getState?.();
      if (current) void this.pushState(current);
    }, PUSH_DEBOUNCE);
  }

  async pushState(state: AppState): Promise<void> {
    if (!this.client || !this.uid) return;
    try {
      const client = this.client;
      const now = Date.now();
      this.deviceId = state.profile.deviceId;
      const localIds = new Set(state.books.map((book) => book.id));
      const rows: BookRow[] = [];
      const updates: Array<[string, RemoteBookMeta]> = [];

      for (const book of state.books) {
        const json = JSON.stringify(stripTimer(book));
        const remote = this.remoteBooks.get(book.id);
        if (remote && !remote.deleted && remote.bookJson === json) continue;
        const revision = (remote?.revision ?? 0) + 1;
        rows.push({
          owner: this.uid,
          id: book.id,
          book: JSON.parse(json) as Book,
          revision,
          updated_at: now,
          device_id: this.deviceId,
          deleted: false,
        });
        updates.push([
          book.id,
          { revision, updatedAt: now, bookJson: json, deleted: false },
        ]);
      }

      for (const [id, remote] of Array.from(this.remoteBooks.entries())) {
        if (localIds.has(id) || remote.deleted) continue;
        const revision = remote.revision + 1;
        rows.push({
          owner: this.uid,
          id,
          book: null,
          revision,
          updated_at: now,
          device_id: this.deviceId,
          deleted: true,
        });
        updates.push([
          id,
          { revision, updatedAt: now, bookJson: '', deleted: true },
        ]);
      }

      if (rows.length > 0) {
        const { error } = await client
          .from('passbook_book')
          .upsert(rows, { onConflict: 'owner,id' });
        if (error) throw new Error(error.message);
        updates.forEach(([id, meta]) => this.remoteBooks.set(id, meta));
      }

      const profileJson = JSON.stringify({ name: state.profile.name });
      const settingsJson = JSON.stringify(state.settings);
      if (
        !this.remoteAccount ||
        this.remoteAccount.profileJson !== profileJson ||
        this.remoteAccount.settingsJson !== settingsJson
      ) {
        const revision = (this.remoteAccount?.revision ?? 0) + 1;
        const { error } = await client.from('passbook_account').upsert(
          {
            owner: this.uid,
            profile: JSON.parse(profileJson),
            settings: state.settings,
            revision,
            updated_at: now,
            device_id: this.deviceId,
          },
          { onConflict: 'owner' },
        );
        if (error) throw new Error(error.message);
        this.remoteAccount = { revision, profileJson, settingsJson };
      }

      this.dirty = false;
      this.setSnapshot({
        status: 'online',
        message: '已同步到云端',
        lastSyncAt: new Date(now).toISOString(),
      });
    } catch (error) {
      this.setSnapshot({
        status: 'offline',
        message: `上传失败：${describeError(error)}`,
      });
    }
  }

  async syncNow(): Promise<void> {
    await this.pullAndApply();
    const state = this.lastState ?? this.getState?.();
    if (state) await this.pushState(state);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.pullAndApply();
      }
    }, POLL_INTERVAL);
    if (!this.visibilityBound) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.pullAndApply();
        }
      });
      this.visibilityBound = true;
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const supabaseSync = new SupabaseSyncService();