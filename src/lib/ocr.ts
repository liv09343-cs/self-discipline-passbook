import type { DdlCategory } from '../types';

export interface OcrProgress {
  status: string;
  progress: number;
}

const STATUS_TEXT: Record<string, string> = {
  'loading tesseract core': '正在装载识别引擎',
  'initializing tesseract': '正在初始化',
  'loading language traineddata': '正在加载中文语料',
  'initializing api': '正在准备识别',
  'recognizing text': '正在识读图片文字',
};

export async function recognizeImage(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const mod = await import('tesseract.js');
  const worker = await mod.createWorker('chi_sim+eng', undefined, {
    logger: (m: any) => {
      onProgress?.({
        status: STATUS_TEXT[m.status] ?? '正在处理',
        progress: typeof m.progress === 'number' ? m.progress : 0,
      });
    },
  });
  try {
    const result = await worker.recognize(file);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

const CATEGORY_KEYWORDS: { category: DdlCategory; words: string[] }[] = [
  { category: 'exam', words: ['考试', '测验', '补考', '期末', '期中', 'exam', 'quiz'] },
  {
    category: 'project',
    words: ['项目', '大作业', '课程设计', '设计', 'project', '比赛', '竞赛'],
  },
  {
    category: 'homework',
    words: ['作业', '习题', '报告', '论文', '提交', '截止', 'deadline', 'homework'],
  },
  { category: 'activity', words: ['讲座', '活动', '会议', '报名', '班会', 'meeting'] },
];

const TITLE_KEYWORDS = [
  '考试',
  '测验',
  '补考',
  '作业',
  '截止',
  '提交',
  '报告',
  '论文',
  '答辩',
  '报名',
  '讲座',
  '会议',
  '实验',
  '项目',
  'deadline',
  'exam',
  'quiz',
  'presentation',
];

export interface ParsedDeadlineText {
  title: string;
  dueAt: string | null;
  category: DdlCategory;
  confidence: 'high' | 'medium' | 'low';
  matched: string[];
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function toNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (CN_DIGITS[value[1]] ?? 0);
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (CN_DIGITS[tens] ?? 1) * 10 + (CN_DIGITS[ones] ?? 0);
  }
  return CN_DIGITS[value] ?? 0;
}

function applyPeriod(hour: number, period: string): number {
  let h = hour;
  if (period === '下午' || period === '傍晚' || period === '晚上') {
    if (h < 12) h += 12;
  }
  if (period === '中午' && h < 11) h += 12;
  return h;
}

function parseClock(text: string): { h: number; m: number } | null {
  const colon = text.match(
    /(上午|早上|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/,
  );
  if (colon) {
    const h = applyPeriod(Number(colon[2]), colon[1] ?? '');
    const m = Number(colon[3]);
    if (h <= 23 && m <= 59) return { h, m };
  }
  const cn = text.match(
    /(上午|早上|中午|下午|傍晚|晚上)?\s*(\d{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点时](半|[零一二三四五六七八九十\d]{1,3}\s*分?)?/,
  );
  if (cn) {
    const h = applyPeriod(toNumber(cn[2]), cn[1] ?? '');
    let m = 0;
    const tail = cn[3] ?? '';
    if (tail.includes('半')) m = 30;
    else {
      const mm = tail.match(/([零一二三四五六七八九十\d]{1,3})/);
      if (mm) m = toNumber(mm[1]);
    }
    if (h <= 23 && m <= 59) return { h, m };
  }
  return null;
}

function parseDate(
  text: string,
  base: Date,
): { y: number; m: number; d: number } | null {
  const full = text.match(
    /(\d{4})\s*[年.\-/]\s*(\d{1,2})\s*[月.\-/]\s*(\d{1,2})\s*[日号]?/,
  );
  if (full) {
    return { y: Number(full[1]), m: Number(full[2]), d: Number(full[3]) };
  }
  const cnDate = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (cnDate) {
    const m = Number(cnDate[1]);
    const d = Number(cnDate[2]);
    let y = base.getFullYear();
    const probe = new Date(y, m - 1, d, 23, 59);
    if (probe.getTime() < base.getTime() - 86400000) y += 1;
    return { y, m, d };
  }
  const slash = text.match(/(?<!\d)(\d{1,2})\s*[/.]\s*(\d{1,2})(?!\d)/);
  if (slash) {
    const m = Number(slash[1]);
    const d = Number(slash[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let y = base.getFullYear();
      const probe = new Date(y, m - 1, d, 23, 59);
      if (probe.getTime() < base.getTime() - 86400000) y += 1;
      return { y, m, d };
    }
  }
  if (/今天/.test(text)) {
    return { y: base.getFullYear(), m: base.getMonth() + 1, d: base.getDate() };
  }
  if (/明天|次日/.test(text)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }
  if (/后天/.test(text)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 2);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }
  const week = text.match(/(下|本|这)?周\s*([一二三四五六日天])/);
  if (week) {
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      日: 0,
      天: 0,
    };
    const targetDow = map[week[2]];
    const d = new Date(base);
    const delta = (targetDow - d.getDay() + 7) % 7 || 7;
    let offset = delta;
    if (week[1] === '下') offset += 7;
    if (week[1] === '本' || week[1] === '这') offset = (targetDow - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + offset);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }
  return null;
}

function inferCategory(text: string): DdlCategory {
  const lower = text.toLowerCase();
  for (const item of CATEGORY_KEYWORDS) {
    if (item.words.some((w) => lower.includes(w.toLowerCase()))) {
      return item.category;
    }
  }
  return 'other';
}

function cleanTitle(line: string): string {
  return line
    .replace(/^(ddl|deadline|截止时间|截止日期)\s*[:：]\s*/i, '')
    .replace(/\d{4}\s*[年.\-/]\s*\d{1,2}\s*[月.\-/]\s*\d{1,2}\s*[日号]?/g, '')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/g, '')
    .replace(/(?<!\d)\d{1,2}\s*[/.]\s*\d{1,2}(?!\d)/g, '')
    .replace(/\d{1,2}\s*[:：]\s*\d{2}\s*[-~—至]+\s*\d{1,2}\s*[:：]\s*\d{2}/g, '')
    .replace(/\d{1,2}\s*[:：]\s*\d{2}/g, '')
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .split(/定于|将于/)[0]
    .replace(/(?:之?前)?(?:提交|截止|完成|举行|开始)\s*$/, '')
    .replace(/^[\s:：·、,，.。\-—~]+|[\s:：·、,，.。\-—~]+$/g, '')
    .trim()
    .slice(0, 30);
}

export function parseDeadlineText(
  raw: string,
  base = new Date(),
): ParsedDeadlineText {
  const text = raw.replace(/\u00a0/g, ' ');
  const matched: string[] = [];
  const dateParts = parseDate(text, base);
  const clock = parseClock(text);
  if (dateParts) {
    matched.push(
      `${dateParts.y} 年 ${dateParts.m} 月 ${dateParts.d} 日`,
    );
  }
  if (clock) {
    matched.push(
      `${String(clock.h).padStart(2, '0')}:${String(clock.m).padStart(2, '0')}`,
    );
  }

  let dueAt: string | null = null;
  if (dateParts) {
    const d = new Date(
      dateParts.y,
      dateParts.m - 1,
      dateParts.d,
      clock ? clock.h : 23,
      clock ? clock.m : 59,
      0,
      0,
    );
    dueAt = d.toISOString();
  } else if (clock) {
    const d = new Date(base);
    d.setHours(clock.h, clock.m, 0, 0);
    if (d.getTime() < base.getTime()) d.setDate(d.getDate() + 1);
    dueAt = d.toISOString();
  } else {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 0, 0);
    dueAt = d.toISOString();
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const keywordLine = lines.find((l) =>
    TITLE_KEYWORDS.some((k) => l.toLowerCase().includes(k.toLowerCase())),
  );
  const fallbackLine = lines.find(
    (l) => l.replace(/[\d\s年月日的日:：\-/.,，、()（）【】\[\]]/g, '').length >= 3,
  );
  const title = cleanTitle(keywordLine ?? fallbackLine ?? '新待办事项') || '新待办事项';

  const confidence: ParsedDeadlineText['confidence'] = dateParts && clock
    ? 'high'
    : dateParts
      ? 'medium'
      : 'low';

  return {
    title,
    dueAt,
    category: inferCategory(text),
    confidence,
    matched,
  };
}