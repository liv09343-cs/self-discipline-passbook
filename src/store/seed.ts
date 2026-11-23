import type {
  AppState,
  Book,
  Deadline,
  DdlCategory,
  LedgerEntry,
  Reward,
  Session,
  Subject,
} from '../types';
import { uid } from '../lib/date';
import { coinsFromMinutes } from '../lib/money';
import { emptyTimer } from '../lib/sync';

function at(offsetDays: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeDeadline(
  title: string,
  offsetDays: number,
  hour: number,
  minute: number,
  category: DdlCategory,
  remindBeforeMin: number,
  note: string,
): Deadline {
  return {
    id: uid(),
    title,
    dueAt: at(offsetDays, hour, minute),
    category,
    remindBeforeMin,
    note,
    source: 'manual',
    done: false,
  };
}

export function defaultSubjects(): Subject[] {
  return [
    { id: uid(), name: '学习', glyph: '学', coinsPerHour: 1 },
    { id: uid(), name: '阅读', glyph: '读', coinsPerHour: 1 },
    { id: uid(), name: '健身', glyph: '健', coinsPerHour: 1 },
    { id: uid(), name: '自习', glyph: '习', coinsPerHour: 1 },
  ];
}

export function defaultRewards(): Reward[] {
  return [
    { id: uid(), title: '一杯奶茶', cost: 4, glyph: '茶', redeemedAt: null },
    { id: uid(), title: '看一场电影', cost: 8, glyph: '影', redeemedAt: null },
    { id: uid(), title: '一顿放纵餐', cost: 12, glyph: '餐', redeemedAt: null },
    { id: uid(), title: '半日短途出游', cost: 20, glyph: '游', redeemedAt: null },
  ];
}

export { emptyTimer };

export function createBook(name: string, glyph?: string): Book {
  const now = new Date();
  const safeName = name.trim() || '新存折';
  return {
    id: uid(),
    name: safeName,
    glyph: (glyph?.trim() || safeName).slice(0, 1),
    accountNo: `NO. ${now.getFullYear()}-${String(
      Math.floor(Math.random() * 9000) + 1000,
    )}`,
    openedAt: now.toISOString(),
    motto: '把自律存进时间银行。',
    subjects: defaultSubjects(),
    timer: emptyTimer(),
    sessions: [],
    ledger: [
      {
        id: uid(),
        at: now.toISOString(),
        kind: 'grant',
        coins: 1,
        stars: 0,
        note: '开户礼 · 新存折启用赠送',
      },
    ],
    rewards: defaultRewards(),
    deadlines: [],
  };
}

function makeSessionRecord(
  subject: Subject,
  daysAgo: number,
  hour: number,
  minute: number,
  durationMin: number,
  note: string,
): { session: Session; entry: LedgerEntry } {
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60000);
  const id = uid();
  const coins = coinsFromMinutes(durationMin, subject.coinsPerHour);
  const stars = Math.max(1, Math.round(durationMin / 60));
  return {
    session: {
      id,
      subjectId: subject.id,
      subjectName: subject.name,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      durationMs: durationMin * 60000,
      coins,
      stars,
      note,
    },
    entry: {
      id: uid(),
      at: end.toISOString(),
      kind: 'earn',
      coins,
      stars,
      note: `${subject.name} · ${durationMin} 分钟${note ? ` · ${note}` : ''}`,
      sessionId: id,
    },
  };
}

export function createSeedState(): AppState {
  const main = createBook('我的存折', '自');
  main.motto = '把自律存进时间银行，把拖延兑换成清醒。';
  const openedAt = at(-10, 9, 0);
  main.openedAt = openedAt;
  if (main.ledger[0]) main.ledger[0].at = openedAt;

  const [studySubject, readingSubject, fitnessSubject, selfStudySubject] =
    main.subjects;
  const seeded = [
    makeSessionRecord(studySubject, 1, 20, 0, 45, '英语单词 + 长难句'),
    makeSessionRecord(readingSubject, 2, 19, 30, 60, '《人类简史》第三章'),
    makeSessionRecord(fitnessSubject, 3, 21, 0, 40, '跑步 5 公里'),
    makeSessionRecord(selfStudySubject, 5, 9, 0, 60, '高数习题'),
  ];
  main.sessions = seeded.map((item) => item.session);
  main.ledger = [...main.ledger, ...seeded.map((item) => item.entry)];
  main.deadlines = [
    makeDeadline(
      '高等数学期中考试',
      5,
      9,
      0,
      'exam',
      1440,
      '教学楼 B203，带学生证与计算器',
    ),
    makeDeadline(
      '大学英语课程论文初稿',
      2,
      23,
      59,
      'homework',
      180,
      '不少于 2000 词，提交至课程平台',
    ),
    makeDeadline(
      '数据结构课程设计答辩',
      9,
      14,
      0,
      'project',
      1440,
      '准备好演示 PPT 与源码仓库',
    ),
    makeDeadline(
      '社团招新宣讲会',
      3,
      19,
      0,
      'activity',
      30,
      '大学生活动中心报告厅',
    ),
  ];

  const study = createBook('考研存折', '研');
  study.motto = '一页一页翻，一天一天存。';
  study.subjects = [
    { id: uid(), name: '数学一', glyph: '数', coinsPerHour: 1 },
    { id: uid(), name: '英语一', glyph: '英', coinsPerHour: 1 },
    { id: uid(), name: '专业课', glyph: '专', coinsPerHour: 1 },
  ];
  study.deadlines = [
    makeDeadline(
      '考研网上报名截止',
      20,
      22,
      0,
      'other',
      2880,
      '核对报考点与证件信息',
    ),
    makeDeadline(
      '专业课模拟考试',
      12,
      8,
      30,
      'exam',
      1440,
      '按正式考试时间完整模拟',
    ),
  ];

  return {
    version: 2,
    profile: {
      name: '林同学',
      deviceId: uid(),
    },
    activeBookId: main.id,
    books: [main, study],
    settings: {
      coinsPerHourDefault: 1,
      minSessionMinutes: 5,
    },
    lastBackupAt: null,
  };
}