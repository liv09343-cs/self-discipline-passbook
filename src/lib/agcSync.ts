import type { AppState, Book } from '../types';
import { emptyTimer } from './sync';

const CONFIG_FILE = 'agc-config.json';
const SCHEMA_FILE = 'agc-schema.json';
const ZONE_NAME = 'passbook';
const POLL_INTERVAL = 120000;
const PUSH_DEBOUNCE = 1500;

export type AgcStatus =
  | 'checking'
  | 'unconfigured'
  | 'ready'
  | 'signing'
  | 'syncing'
  | 'online'
  | 'offline'
  | 'error';

export interface AgcUserInfo {
  uid: string;
  email: string;
}

export interface AgcSnapshot {
  status: AgcStatus;
  configured: boolean;
  user: AgcUserInfo | null;
  message: string;
  lastSyncAt: string | null;
  missingSchema: boolean;
}

class PassbookAccount {
  owner = '';
  profileJson = '';
  settingsJson = '';
  revision = 0;
  updatedAt = 0;
  deviceId = '';

  constructor(init?: Partial<PassbookAccount>) {
    if (init) Object.assign(this, init);
  }
}

class PassbookBook {
  id = '';
  owner = '';
  bookJson = '';
  revision = 0;
  updatedAt = 0;
  deviceId = '';
  deleted = false;

  constructor(init?: Partial<PassbookBook>) {
    if (init) Object.assign(this, init);
  }
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
    code?: string | number;
    errorCode?: string | number;
    message?: string;
    errorMessage?: string;
  };
  const code = value.code ?? value.errorCode;
  const text = value.errorMessage ?? value.message ?? String(error);
  return code ? `${text}（${code}）` : text;
}

function stripTimer(book: Book): Book {
  return { ...book, timer: emptyTimer() };
}

function parseBook(json: string): Book | null {
  try {
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object') return null;
    if (typeof value.id !== 'string' || typeof value.name !== 'string') {
      return null;
    }
    return value as Book;
  } catch {
    return null;
  }
}

class AgcSyncService {
  private snapshot: AgcSnapshot = {
    status: 'checking',
    configured: false,
    user: null,
    message: '正在检查云端配置',
    lastSyncAt: null,
    missingSchema: false,
  };
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;
  private agconnect: any = null;
  private db: any = null;
  private zone: any = null;
  private config: any = null;
  private uid = '';
  private deviceId = '';
  private currentUser: any = null;
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

  getSnapshot = (): AgcSnapshot => this.snapshot;

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

  private setSnapshot(patch: Partial<AgcSnapshot>): void {
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
      message: '正在检查 AGC 配置',
    });
    const config = await this.loadJson(CONFIG_FILE);
    if (!config) {
      this.setSnapshot({
        status: 'unconfigured',
        configured: false,
        message: '未找到 agc-config.json，当前为本机模式',
      });
      return;
    }
    try {
      this.config = config;
      const api: any = await import('@hw-agconnect/api');
      await import('@hw-agconnect/instance');
      await import('@hw-agconnect/auth');
      const dbModule: any = await import('@hw-agconnect/database');
      const agconnect = api.default ?? api;
      agconnect.instance().configInstance(config);
      dbModule.AGConnectCloudDB.initialize(agconnect.instance().config());
      this.agconnect = agconnect;
      this.db = dbModule;

      const schema = await this.loadJson(SCHEMA_FILE);
      if (schema) {
        try {
          dbModule.AGConnectCloudDB.getInstance().createObjectType(schema);
        } catch {
          this.setSnapshot({ missingSchema: false });
        }
      } else {
        this.setSnapshot({ missingSchema: true });
      }

      const user = await agconnect.auth().getCurrentUser();
      if (user) {
        this.currentUser = user;
        const info = {
          uid: user.getUid(),
          email: String(user.getEmail() ?? ''),
        };
        this.setSnapshot({
          status: 'online',
          configured: true,
          user: info,
          message: '已恢复登录，正在同步',
          missingSchema: this.snapshot.missingSchema,
        });
        try {
          await this.openZone(user);
          this.startPolling();
          await this.pullAndApply();
          const local = this.getState?.();
          if (local) await this.pushState(local);
        } catch (error) {
          this.setSnapshot({
            status: 'offline',
            user: info,
            message: `已恢复登录，但云数据库连接失败：${describeError(error)}`,
          });
        }
      } else {
        this.setSnapshot({
          status: 'ready',
          configured: true,
          user: null,
          message: 'AGC 已配置，登录后开始多端同步',
        });
      }
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        configured: true,
        message: `AGC 初始化失败：${describeError(error)}`,
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

  private async openZone(user: any): Promise<void> {
    if (!this.db) throw new Error('AGC SDK 未初始化');
    this.uid = user.getUid();
    if (this.zone) return;
    const zoneConfig = new this.db.CloudDBZoneConfig(ZONE_NAME);
    this.zone = await this.db.AGConnectCloudDB.getInstance().openCloudDBZone(
      zoneConfig,
    );
  }

  async sendEmailCode(email: string): Promise<void> {
    await this.init();
    if (!this.agconnect) throw new Error('AGC 尚未配置');
    const auth = this.agconnect.auth();
    await auth.requestEmailVerifyCode(email, 1001, 'zh_CN', 60);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.init();
    if (!this.agconnect) throw new Error('AGC 尚未配置');
    this.setSnapshot({ status: 'signing', message: '正在登录…' });
    try {
      const auth = this.agconnect.auth();
      const credential = auth.EmailAuthProvider.credential(email, password);
      const result = await auth.signIn(credential);
      await this.finishSignIn(result.getUser(), email);
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        message: `登录失败：${describeError(error)}`,
      });
      throw error;
    }
  }

  async signUp(
    email: string,
    password: string,
    verifyCode: string,
  ): Promise<void> {
    await this.init();
    if (!this.agconnect) throw new Error('AGC 尚未配置');
    this.setSnapshot({ status: 'signing', message: '正在注册…' });
    try {
      const auth = this.agconnect.auth();
      const result = await auth.createEmailUser({
        email,
        password,
        verifyCode,
      } as any);
      await this.finishSignIn(result.getUser(), email);
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        message: `注册失败：${describeError(error)}`,
      });
      throw error;
    }
  }

  private async finishSignIn(user: any, email: string): Promise<void> {
    this.currentUser = user;
    this.dirty = false;
    this.initialized = false;
    const local = this.getState?.();
    this.deviceId = local?.profile.deviceId ?? '';
    const info = {
      uid: user.getUid(),
      email: String(user.getEmail() ?? email),
    };
    this.setSnapshot({
      status: 'online',
      configured: true,
      user: info,
      message: '登录成功，正在同步',
      missingSchema: this.snapshot.missingSchema,
    });
    try {
      await this.openZone(user);
      this.startPolling();
      await this.pullAndApply();
      if (local) await this.pushState(local);
    } catch (error) {
      this.zone = null;
      this.setSnapshot({
        status: 'offline',
        user: info,
        message: `已登录，但云数据库连接失败：${describeError(error)}`,
      });
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.agconnect) await this.agconnect.auth().signOut();
    } catch {
      // 忽略登出失败
    }
    this.stopPolling();
    this.zone = null;
    this.uid = '';
    this.currentUser = null;
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
    const bookQuery = this.db.CloudDBZoneQuery.where(PassbookBook).equalTo(
      'owner',
      this.uid,
    );
    const bookSnapshot = await this.zone.executeQuery(bookQuery);
    const bookRows = bookSnapshot.getSnapshotObjects() as PassbookBook[];
    this.remoteBooks.clear();
    bookRows.forEach((row) => {
      this.remoteBooks.set(row.id, {
        revision: Number(row.revision) || 0,
        updatedAt: Number(row.updatedAt) || 0,
        bookJson: row.bookJson ?? '',
        deleted: Boolean(row.deleted),
      });
    });

    const accountQuery = this.db.CloudDBZoneQuery.where(
      PassbookAccount,
    ).equalTo('owner', this.uid);
    const accountSnapshot = await this.zone.executeQuery(accountQuery);
    const accounts = accountSnapshot.getSnapshotObjects() as PassbookAccount[];
    const account = accounts[0];
    this.remoteAccount = account
      ? {
          revision: Number(account.revision) || 0,
          profileJson: account.profileJson ?? '',
          settingsJson: account.settingsJson ?? '',
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
      const remoteBook = parseBook(remote.bookJson);
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
      const remoteBook = parseBook(remote.bookJson);
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
          if (
            JSON.stringify(settings) !== JSON.stringify(local.settings)
          ) {
            changed = true;
          }
        }
      } catch {
        // 忽略损坏的账户配置
      }
    }

    const activeBookId = books.some(
      (book) => book.id === local.activeBookId,
    )
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

  async pullAndApply(): Promise<boolean> {
    if (!this.zone || !this.uid) return false;
    if (this.dirty && this.initialized) {
      this.setSnapshot({
        status: 'online',
        message: '本地有新改动，稍后自动同步',
      });
      return false;
    }
    this.setSnapshot({ status: 'syncing', message: '正在从云端拉取…' });
    try {
      await this.fetchRemote();
      const local = this.getState?.();
      if (!local) {
        this.setSnapshot({ status: 'online', message: '等待账本加载' });
        return false;
      }
      const merged = this.mergeRemote(local);
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
    if (
      this.snapshot.status !== 'online' ||
      !this.initialized ||
      !this.zone
    ) {
      return;
    }
    this.deviceId = state.profile.deviceId;
    this.dirty = true;
    if (this.pushTimer) window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => {
      const current = this.getState?.();
      if (current) void this.pushState(current);
    }, PUSH_DEBOUNCE);
  }

  async pushState(state: AppState): Promise<void> {
    if (!this.zone || !this.uid) return;
    try {
      const now = Date.now();
      this.deviceId = state.profile.deviceId;
      const localIds = new Set(state.books.map((book) => book.id));

      for (const book of state.books) {
        const json = JSON.stringify(stripTimer(book));
        const remote = this.remoteBooks.get(book.id);
        if (remote && !remote.deleted && remote.bookJson === json) continue;
        const revision = (remote?.revision ?? 0) + 1;
        await this.zone.executeUpsert(
          new PassbookBook({
            id: book.id,
            owner: this.uid,
            bookJson: json,
            revision,
            updatedAt: now,
            deviceId: this.deviceId,
            deleted: false,
          }),
        );
        this.remoteBooks.set(book.id, {
          revision,
          updatedAt: now,
          bookJson: json,
          deleted: false,
        });
      }

      for (const [id, remote] of Array.from(this.remoteBooks.entries())) {
        if (localIds.has(id) || remote.deleted) continue;
        const revision = remote.revision + 1;
        await this.zone.executeUpsert(
          new PassbookBook({
            id,
            owner: this.uid,
            bookJson: '',
            revision,
            updatedAt: now,
            deviceId: this.deviceId,
            deleted: true,
          }),
        );
        this.remoteBooks.set(id, {
          revision,
          updatedAt: now,
          bookJson: '',
          deleted: true,
        });
      }

      const profileJson = JSON.stringify({ name: state.profile.name });
      const settingsJson = JSON.stringify(state.settings);
      if (
        !this.remoteAccount ||
        this.remoteAccount.profileJson !== profileJson ||
        this.remoteAccount.settingsJson !== settingsJson
      ) {
        const revision = (this.remoteAccount?.revision ?? 0) + 1;
        await this.zone.executeUpsert(
          new PassbookAccount({
            owner: this.uid,
            profileJson,
            settingsJson,
            revision,
            updatedAt: now,
            deviceId: this.deviceId,
          }),
        );
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
    if (this.currentUser && !this.zone) {
      try {
        await this.openZone(this.currentUser);
        this.startPolling();
      } catch (error) {
        this.setSnapshot({
          status: 'offline',
          message: `云数据库连接失败：${describeError(error)}`,
        });
        return;
      }
    }
    await this.pullAndApply();
    const state = this.getState?.();
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

export const agcSync = new AgcSyncService();