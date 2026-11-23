export type TabKey = 'timer' | 'ledger' | 'rewards' | 'calendar' | 'stats';

export type LedgerKind = 'earn' | 'spend' | 'grant';

export type DdlCategory = 'exam' | 'homework' | 'project' | 'activity' | 'other';

export interface Profile {
  name: string;
  deviceId: string;
}

export interface Subject {
  id: string;
  name: string;
  glyph: string;
  coinsPerHour: number;
}

export interface TimerState {
  subjectId: string | null;
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
}

export interface Session {
  id: string;
  subjectId: string;
  subjectName: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  coins: number;
  stars: number;
  note: string;
}

export interface LedgerEntry {
  id: string;
  at: string;
  kind: LedgerKind;
  coins: number;
  stars: number;
  note: string;
  sessionId?: string;
  rewardId?: string;
}

export interface Reward {
  id: string;
  title: string;
  cost: number;
  glyph: string;
  redeemedAt: string | null;
}

export interface Deadline {
  id: string;
  title: string;
  dueAt: string;
  category: DdlCategory;
  remindBeforeMin: number;
  note: string;
  source: 'manual' | 'ocr';
  done: boolean;
}

export interface Book {
  id: string;
  name: string;
  glyph: string;
  accountNo: string;
  openedAt: string;
  motto: string;
  subjects: Subject[];
  timer: TimerState;
  sessions: Session[];
  ledger: LedgerEntry[];
  rewards: Reward[];
  deadlines: Deadline[];
}

export interface AppSettings {
  coinsPerHourDefault: number;
  minSessionMinutes: number;
}

export interface AppState {
  version: 2;
  profile: Profile;
  activeBookId: string;
  books: Book[];
  settings: AppSettings;
  lastBackupAt: string | null;
}

export const CATEGORY_META: Record<
  DdlCategory,
  { label: string; short: string; tone: string }
> = {
  exam: { label: '考试', short: '考', tone: 'vermilion' },
  homework: { label: '作业', short: '作', tone: 'brown' },
  project: { label: '项目', short: '项', tone: 'gold' },
  activity: { label: '活动', short: '活', tone: 'green' },
  other: { label: '其他', short: '记', tone: 'ink' },
};

export const REMIND_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '到期时' },
  { value: 10, label: '提前 10 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 180, label: '提前 3 小时' },
  { value: 1440, label: '提前 1 天' },
  { value: 2880, label: '提前 2 天' },
];