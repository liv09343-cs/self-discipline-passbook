import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppState,
  Book,
  Deadline,
  LedgerEntry,

  Session,
} from '../types';
import { uid } from '../lib/date';
import { coinBalance } from '../lib/ledger';
import { coinsFromMinutes, round1 } from '../lib/money';
import { createBook, createSeedState, emptyTimer } from './seed';
import { makeDeviceId, validateState } from '../lib/sync';

const STORAGE_KEY = 'self-passbook-state-v1';

export interface Settlement {
  counted: boolean;
  coins: number;
  stars: number;
  minutes: number;
  subjectName: string;
}

export interface DeadlineInput {
  title: string;
  dueAt: string;
  category: Deadline['category'];
  remindBeforeMin: number;
  note: string;
  source: Deadline['source'];
}

type Action =
  | { type: 'SET_PROFILE_NAME'; name: string }
  | { type: 'SET_ACTIVE_BOOK'; id: string }
  | { type: 'CREATE_BOOK'; book: Book }
  | {
      type: 'UPDATE_BOOK_META';
      id: string;
      patch: Partial<Pick<Book, 'name' | 'glyph' | 'motto' | 'accountNo'>>;
    }
  | { type: 'DELETE_BOOK'; id: string }
  | { type: 'UPDATE_ACTIVE'; updater: (book: Book) => Book }
  | { type: 'REPLACE_STATE'; state: AppState }
  | { type: 'MARK_BACKUP'; at: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PROFILE_NAME':
      return {
        ...state,
        profile: { ...state.profile, name: action.name },
      };
    case 'SET_ACTIVE_BOOK':
      if (!state.books.some((book) => book.id === action.id)) return state;
      return { ...state, activeBookId: action.id };
    case 'CREATE_BOOK':
      return {
        ...state,
        books: [...state.books, action.book],
        activeBookId: action.book.id,
      };
    case 'UPDATE_BOOK_META':
      return {
        ...state,
        books: state.books.map((book) =>
          book.id === action.id ? { ...book, ...action.patch } : book,
        ),
      };
    case 'DELETE_BOOK': {
      if (state.books.length <= 1) return state;
      const books = state.books.filter((book) => book.id !== action.id);
      if (books.length === state.books.length) return state;
      return {
        ...state,
        books,
        activeBookId:
          state.activeBookId === action.id
            ? books[0].id
            : state.activeBookId,
      };
    }
    case 'UPDATE_ACTIVE':
      return {
        ...state,
        books: state.books.map((book) =>
          book.id === state.activeBookId ? action.updater(book) : book,
        ),
      };
    case 'REPLACE_STATE':
      return action.state;
    case 'MARK_BACKUP':
      return { ...state, lastBackupAt: action.at };
    default:
      return state;
  }
}

function migrate(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') return createSeedState();
  const data = raw as Record<string, any>;
  if (
    data.version === 2 &&
    Array.isArray(data.books) &&
    data.books.length > 0
  ) {
    try {
      return validateState(data);
    } catch {
      return createSeedState();
    }
  }
  if (!data.profile || !Array.isArray(data.ledger)) {
    return createSeedState();
  }
  const oldName =
    typeof data.profile.name === 'string' ? data.profile.name : '同学';
  const book = createBook(`${oldName}的存折`, oldName.slice(0, 1));
  if (typeof data.profile.accountNo === 'string') {
    book.accountNo = data.profile.accountNo;
  }
  if (typeof data.profile.openedAt === 'string') {
    book.openedAt = data.profile.openedAt;
  }
  if (typeof data.profile.motto === 'string') {
    book.motto = data.profile.motto;
  }
  if (Array.isArray(data.subjects) && data.subjects.length > 0) {
    book.subjects = data.subjects.map((subject: any) => ({
      id: typeof subject.id === 'string' ? subject.id : uid(),
      name: typeof subject.name === 'string' ? subject.name : '自律',
      glyph:
        typeof subject.glyph === 'string'
          ? subject.glyph.slice(0, 1)
          : String(subject.name ?? '律').slice(0, 1),
      coinsPerHour: Math.min(
        1,
        Math.max(0.5, Number(subject.coinsPerHour) || 1),
      ),
    }));
  }
  if (data.timer && typeof data.timer === 'object') {
    book.timer = data.timer as Book['timer'];
    if (
      book.timer.subjectId &&
      !book.subjects.some((subject) => subject.id === book.timer.subjectId)
    ) {
      book.timer = emptyTimer();
    }
  }
  book.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  book.ledger = data.ledger;
  if (Array.isArray(data.rewards) && data.rewards.length > 0) {
    book.rewards = data.rewards;
  }
  book.deadlines = Array.isArray(data.deadlines) ? data.deadlines : [];
  return {
    version: 2,
    profile: { name: oldName, deviceId: makeDeviceId() },
    activeBookId: book.id,
    books: [book],
    settings: {
      coinsPerHourDefault: 1,
      minSessionMinutes:
        typeof data.settings?.minSessionMinutes === 'number'
          ? data.settings.minSessionMinutes
          : 5,
    },
    lastBackupAt: null,
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    return createSeedState();
  }
  return createSeedState();
}

function activeBookOf(state: AppState): Book {
  return (
    state.books.find((book) => book.id === state.activeBookId) ??
    state.books[0]
  );
}

export interface AppContextValue {
  state: AppState;
  book: Book;
  balance: number;
  actions: {
    updateProfileName: (name: string) => void;
    switchBook: (id: string) => void;
    createBook: (name: string, glyph: string) => Book;
    updateBookMeta: (
      id: string,
      patch: Partial<Pick<Book, 'name' | 'glyph' | 'motto' | 'accountNo'>>,
    ) => void;
    deleteBook: (id: string) => void;
    addSubject: (name: string, coinsPerHour: number) => void;
    removeSubject: (id: string) => void;
    startTimer: (subjectId: string) => void;
    pauseTimer: () => void;
    resumeTimer: () => void;
    discardTimer: () => void;
    finishTimer: (note: string) => Settlement;
    addReward: (title: string, cost: number) => void;
    removeReward: (id: string) => void;
    redeemReward: (id: string) => { ok: boolean; message: string };
    addDeadline: (input: DeadlineInput) => void;
    updateDeadline: (id: string, patch: Partial<Deadline>) => void;
    toggleDeadline: (id: string) => void;
    removeDeadline: (id: string) => void;
    replaceState: (next: AppState) => void;
    markBackup: () => void;
    resetAll: () => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return;
    }
  }, [state]);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const next = migrate(JSON.parse(event.newValue));
        const current = stateRef.current;
        const activeId = current.activeBookId;
        const activeTimer = current.books.find(
          (book) => book.id === activeId,
        )?.timer;
        const merged: AppState = activeTimer
          ? {
              ...next,
              activeBookId: next.books.some((book) => book.id === activeId)
                ? activeId
                : next.activeBookId,
              books: next.books.map((book) =>
                book.id === activeId
                  ? { ...book, timer: activeTimer }
                  : book,
              ),
            }
          : next;
        dispatch({ type: 'REPLACE_STATE', state: merged });
      } catch {
        return;
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const actions = useMemo<AppContextValue['actions']>(() => {
    const updateActive = (updater: (book: Book) => Book) =>
      dispatch({ type: 'UPDATE_ACTIVE', updater });

    const finishTimer = (note: string): Settlement => {
      const current = activeBookOf(stateRef.current);
      const timer = current.timer;
      const subject = current.subjects.find((s) => s.id === timer.subjectId);
      const subjectName = subject?.name ?? '自律';
      const durationMs =
        timer.accumulatedMs +
        (timer.running && timer.startedAt ? Date.now() - timer.startedAt : 0);
      const minutes = durationMs / 60000;
      const counted =
        minutes >= stateRef.current.settings.minSessionMinutes &&
        Boolean(subject);
      const coins = counted
        ? Math.max(
            0.1,
            coinsFromMinutes(minutes, subject?.coinsPerHour ?? 1),
          )
        : 0;
      const stars = counted ? Math.max(1, Math.round(minutes / 60)) : 0;
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - durationMs).toISOString();

      if (counted && subject) {
        const sessionId = uid();
        const session: Session = {
          id: sessionId,
          subjectId: subject.id,
          subjectName,
          startedAt,
          endedAt,
          durationMs,
          coins,
          stars,
          note,
        };
        const entry: LedgerEntry = {
          id: uid(),
          at: endedAt,
          kind: 'earn',
          coins,
          stars,
          note: `${subjectName} · ${Math.round(minutes)} 分钟${
            note ? ` · ${note}` : ''
          }`,
          sessionId,
        };
        updateActive((book) => ({
          ...book,
          timer: emptyTimer(),
          sessions: [...book.sessions, session],
          ledger: [...book.ledger, entry],
        }));
      } else {
        updateActive((book) => ({ ...book, timer: emptyTimer() }));
      }
      return { counted, coins: round1(coins), stars, minutes, subjectName };
    };

    const redeemReward = (id: string): { ok: boolean; message: string } => {
      const current = activeBookOf(stateRef.current);
      const reward = current.rewards.find((item) => item.id === id);
      if (!reward) return { ok: false, message: '奖励不存在' };
      const balance = coinBalance(current.ledger);
      if (balance < reward.cost) {
        return {
          ok: false,
          message: `还差 ${round1(reward.cost - balance)} 枚硬币，先去存一点自律吧`,
        };
      }
      const at = new Date().toISOString();
      updateActive((book) => ({
        ...book,
        rewards: book.rewards.map((item) =>
          item.id === id ? { ...item, redeemedAt: at } : item,
        ),
        ledger: [
          ...book.ledger,
          {
            id: uid(),
            at,
            kind: 'spend',
            coins: reward.cost,
            stars: 0,
            note: `兑换 · ${reward.title}`,
            rewardId: reward.id,
          },
        ],
      }));
      return { ok: true, message: `已兑换「${reward.title}」，好好享受` };
    };

    return {
      updateProfileName: (name) =>
        dispatch({ type: 'SET_PROFILE_NAME', name: name.trim() || '同学' }),
      switchBook: (id) => dispatch({ type: 'SET_ACTIVE_BOOK', id }),
      createBook: (name, glyph) => {
        const book = createBook(name, glyph);
        dispatch({ type: 'CREATE_BOOK', book });
        return book;
      },
      updateBookMeta: (id, patch) =>
        dispatch({ type: 'UPDATE_BOOK_META', id, patch }),
      deleteBook: (id) => dispatch({ type: 'DELETE_BOOK', id }),
      addSubject: (name, coinsPerHour) =>
        updateActive((book) => ({
          ...book,
          subjects: [
            ...book.subjects,
            {
              id: uid(),
              name: name.trim() || '自律',
              glyph: (name.trim() || '律').slice(0, 1),
              coinsPerHour: Math.min(
                3,
                Math.max(0.5, round1(coinsPerHour)),
              ),
            },
          ],
        })),
      removeSubject: (id) =>
        updateActive((book) => ({
          ...book,
          subjects: book.subjects.filter((subject) => subject.id !== id),
          timer:
            book.timer.subjectId === id ? emptyTimer() : book.timer,
        })),
      startTimer: (subjectId) =>
        updateActive((book) => ({
          ...book,
          timer: {
            subjectId,
            running: true,
            startedAt: Date.now(),
            accumulatedMs: 0,
          },
        })),
      pauseTimer: () =>
        updateActive((book) => {
          const timer = book.timer;
          if (!timer.running || !timer.startedAt) return book;
          return {
            ...book,
            timer: {
              ...timer,
              running: false,
              accumulatedMs:
                timer.accumulatedMs + (Date.now() - timer.startedAt),
              startedAt: null,
            },
          };
        }),
      resumeTimer: () =>
        updateActive((book) => {
          if (book.timer.running || !book.timer.subjectId) return book;
          return {
            ...book,
            timer: {
              ...book.timer,
              running: true,
              startedAt: Date.now(),
            },
          };
        }),
      discardTimer: () =>
        updateActive((book) => ({ ...book, timer: emptyTimer() })),
      finishTimer,
      addReward: (title, cost) =>
        updateActive((book) => ({
          ...book,
          rewards: [
            ...book.rewards,
            {
              id: uid(),
              title: title.trim() || '新奖励',
              cost: Math.max(1, Math.round(cost)),
              glyph: (title.trim() || '奖').slice(0, 1),
              redeemedAt: null,
            },
          ],
        })),
      removeReward: (id) =>
        updateActive((book) => ({
          ...book,
          rewards: book.rewards.filter((reward) => reward.id !== id),
        })),
      redeemReward,
      addDeadline: (input) =>
        updateActive((book) => ({
          ...book,
          deadlines: [
            ...book.deadlines,
            {
              id: uid(),
              title: input.title.trim() || '未命名 DDL',
              dueAt: input.dueAt,
              category: input.category,
              remindBeforeMin: input.remindBeforeMin,
              note: input.note.trim(),
              source: input.source,
              done: false,
            },
          ],
        })),
      updateDeadline: (id, patch) =>
        updateActive((book) => ({
          ...book,
          deadlines: book.deadlines.map((deadline) =>
            deadline.id === id ? { ...deadline, ...patch } : deadline,
          ),
        })),
      toggleDeadline: (id) =>
        updateActive((book) => ({
          ...book,
          deadlines: book.deadlines.map((deadline) =>
            deadline.id === id
              ? { ...deadline, done: !deadline.done }
              : deadline,
          ),
        })),
      removeDeadline: (id) =>
        updateActive((book) => ({
          ...book,
          deadlines: book.deadlines.filter(
            (deadline) => deadline.id !== id,
          ),
        })),
      replaceState: (next) => {
        try {
          dispatch({ type: 'REPLACE_STATE', state: validateState(next) });
        } catch {
          return;
        }
      },
      markBackup: () =>
        dispatch({ type: 'MARK_BACKUP', at: new Date().toISOString() }),
      resetAll: () =>
        dispatch({ type: 'REPLACE_STATE', state: createSeedState() }),
    };
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const book = activeBookOf(state);
    return {
      state,
      book,
      balance: coinBalance(book.ledger),
      actions,
    };
  }, [state, actions]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useElapsedMs(): number {
  const { book } = useApp();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!book.timer.running) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [book.timer.running]);
  const timer = book.timer;
  return (
    timer.accumulatedMs +
    (timer.running && timer.startedAt ? Date.now() - timer.startedAt : 0)
  );
}