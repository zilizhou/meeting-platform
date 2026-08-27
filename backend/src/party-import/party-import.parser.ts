import * as mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { BadRequestException } from '@nestjs/common';
import { PartyImportTopicDraft } from './party-import.types';

const CN_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

export function normalizePersonName(name: string) {
  return name
    .replace(/\s+/g, '')
    .replace(/[，,、；;]/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .trim();
}

export function splitPersonNames(block: string): string[] {
  const cleaned = block
    .replace(/出席人数[：:]?/g, '')
    .replace(/应参会人员/g, '')
    .replace(/出\s*席[：:]?/g, '')
    .replace(/请\s*假[：:]?/g, '')
    .replace(/缺\s*席[：:]?/g, '')
    .replace(/回\s*避[：:]?/g, '')
    .replace(/列\s*席[：:]?/g, '')
    .replace(/无/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[，,、；;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  // 先按空白切词，再把连续单字拼成二字名（马 旭 / 高 鹏 / 徐 娟）
  const tokens = cleaned.split(' ').map((t) => t.trim()).filter(Boolean);
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (
      /^[\u4e00-\u9fa5]$/.test(a) &&
      b &&
      /^[\u4e00-\u9fa5]$/.test(b)
    ) {
      merged.push(a + b);
      i += 1;
      continue;
    }
    merged.push(a);
  }
  const names = merged
    .map((n) => normalizePersonName(n))
    .filter((n) => n.length >= 2 && n.length <= 4 && !/^\d+$/.test(n));
  return [...new Set(names)];
}

export async function extractDocText(
  buffer: Buffer,
  originalName: string,
): Promise<string> {
  const lower = originalName.toLowerCase();
  try {
    if (lower.endsWith('.docx')) {
      const r = await mammoth.extractRawText({ buffer });
      return cleanText(r.value || '');
    }
    if (lower.endsWith('.doc') || lower.endsWith('.txt')) {
      if (lower.endsWith('.txt')) return cleanText(buffer.toString('utf8'));
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return cleanText(doc.getBody() || '');
    }
  } catch (e) {
    throw new BadRequestException(
      `无法解析文件「${originalName}」：${String(e)}`,
    );
  }
  throw new BadRequestException(
    `暂仅支持 .doc / .docx / .txt，收到：${originalName}`,
  );
}

function cleanText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/安徽省教育厅/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseCollegeHint(...texts: string[]) {
  for (const t of texts) {
    const m = t.match(
      /([\u4e00-\u9fa5A-Za-z0-9]{2,20}学院).{0,20}(党委会议|党委会|党组织会议|党委会议题|党政联席)/,
    );
    if (m) return m[1];
  }
  const m2 = texts.join('\n').match(/([\u4e00-\u9fa5]{2,20}学院)/);
  return m2?.[1] || '';
}

export function parseDateTime(text: string): Date | null {
  const re =
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|晚上)?\s*(\d{1,2})\s*[：:时]\s*(\d{1,2})?)?/g;
  const matches = [...text.matchAll(re)];
  if (!matches.length) return null;
  // 优先带具体钟点的匹配，避免命中「填表时间」仅有日期
  const m =
    matches.find((x) => x[5]) ||
    matches[matches.length - 1] ||
    matches[0];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let hour = m[5] ? Number(m[5]) : 9;
  const minute = m[6] ? Number(m[6]) : 0;
  if (m[4] === '下午' && hour < 12) hour += 12;
  if (m[4] === '晚上' && hour < 12) hour += 12;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function parseLocation(
  agendaText: string,
  minutesText: string,
  recordText = '',
) {
  const fromMinutes = minutesText.match(/会议地点[：:\[\s]*([^\n\]]+)/);
  if (fromMinutes) return fromMinutes[1].replace(/[\[\]]/g, '').trim();
  const fromRecord = recordText.match(/地点[：:\s]*([^\n]+)/);
  if (fromRecord) return fromRecord[1].replace(/[\[\]]/g, '').trim();
  const loose =
    agendaText.match(/学院\s*[A-Za-z]?\s*\d*\s*会议室\s*[A-Za-z]?\d+/) ||
    agendaText.match(/学院会议室\s*[A-Za-z]?\d+/);
  if (loose) return loose[0].replace(/\s+/g, '');
  return '';
}

export function parseHostRecorder(minutesText: string, recordText: string) {
  const src = `${minutesText}\n${recordText}`;
  const host =
    src.match(/主\s*持\s*人[：:\s]*([^\n\r]+)/)?.[1]?.trim() ||
    src.match(/主持人[：:\s]*([^\n\r]+)/)?.[1]?.trim() ||
    '';
  const recorder =
    src.match(/记\s*录\s*人[：:\s]*([^\n\r]+)/)?.[1]?.trim() ||
    src.match(/记录人[：:\s]*([^\n\r]+)/)?.[1]?.trim() ||
    src.match(/会议由([^\n，,]{2,4})记录/)?.[1]?.trim() ||
    '';
  return {
    hostName: normalizePersonName(host),
    recorderName: normalizePersonName(recorder),
  };
}

export function parseAttendanceBlocks(
  minutesText: string,
  agendaText: string,
  recordText = '',
) {
  const attendBlock =
    recordText.match(/出席人员[：:\s]*([^\n]+)/)?.[1] ||
    minutesText.match(/出\s*席[：:\s]*([\s\S]*?)(?=请\s*假|缺\s*席|回\s*避|列\s*席|网络空间|$)/)?.[1] ||
    minutesText.match(/出席[：:]\s*([\s\S]*?)(?=请假|缺席|回避|网络空间|$)/)?.[1] ||
    agendaText.match(/应参会人员([\s\S]*?)(?=会议议题|议题[：:]|$)/)?.[1] ||
    '';
  const leaveBlock =
    recordText.match(/请假人员[：:\s]*([^\n]*)/)?.[1] ||
    minutesText.match(/请\s*假[：:\s]*([^\n]*)/)?.[1] ||
    minutesText.match(/请假[：:]\s*([^\n]*)/)?.[1] ||
    '';
  const absentBlock =
    minutesText.match(/缺\s*席[：:\s]*([^\n]*)/)?.[1] ||
    minutesText.match(/缺席[：:]\s*([^\n]*)/)?.[1] ||
    '';
  const avoidBlock =
    minutesText.match(/回\s*避[：:\s]*([^\n]*)/)?.[1] ||
    minutesText.match(/回避[：:]\s*([^\n]*)/)?.[1] ||
    '';
  const observerBlock =
    recordText.match(/列席人员[：:\s]*([^\n]+)/)?.[1] ||
    minutesText.match(/列\s*席[：:\s]*([^\n]+)/)?.[1] ||
    agendaText.match(/列席人员[：:\s]*([^\n]+)/)?.[1] ||
    '';

  const leave = splitPersonNames(leaveBlock);
  const absent = splitPersonNames(absentBlock);
  const avoid = splitPersonNames(avoidBlock);
  const observers = splitPersonNames(observerBlock);
  const attend = splitPersonNames(attendBlock).filter(
    (n) => !leave.includes(n) && !absent.includes(n),
  );
  return { attend, leave, absent, avoid, observers };
}

function extractResolutions(agendaText: string): string[] {
  const idx = agendaText.search(/会议决议/);
  if (idx < 0) return [];
  const end = agendaText.slice(idx).search(/\n\s*负责人|\n\s*备\s*注/);
  const block = agendaText.slice(
    idx,
    idx + (end > 0 ? end : 1200),
  );
  const items = [
    ...block.matchAll(/(?:^|[\n\t]|会议决议)\s*(\d+)[\.、．]\s*([^\n]+)/g),
  ].map((m) => m[2].trim());
  return items.filter((x) => x && !/负责人签名|备注|办公室/.test(x));
}

/** 标题是否像「第一议题 / 政治理论学习」 */
export function isLikelyFirstTopic(title: string) {
  const t = (title || '').replace(/\s+/g, '');
  if (!t) return false;
  return /第一议题|政治理论学习|习近平|中央精神|重要讲话|重要指示|理论武装|学习贯彻|党的二十大|二十届三中全会|主题教育/.test(
    t,
  );
}

function extractAgendaTopics(agendaText: string): {
  titles: string[];
  /** 议题表显式「第一议题：」条目在 titles 中的下标 */
  labeledFirstIndex: number | null;
} {
  const titles: string[] = [];
  let labeledFirstIndex: number | null = null;
  const first = agendaText.match(/第一议题[：:]\s*([^\n]+)/);
  if (first) {
    titles.push(first[1].trim());
    labeledFirstIndex = 0;
  }
  const numbered = [
    ...agendaText.matchAll(/(?:^|\n)\s*(\d+)[\.、．]\s*([^\n]+)/g),
  ];
  for (const m of numbered) {
    const t = m[2].trim();
    if (/负责人|会议决议|备注/.test(t)) continue;
    if (titles.some((x) => x.includes(t) || t.includes(x))) continue;
    // 跳过决议区编号（出现在「会议决议」之后）
    const pos = agendaText.indexOf(m[0]);
    const resPos = agendaText.search(/会议决议/);
    if (resPos >= 0 && pos > resPos) continue;
    titles.push(t);
  }
  return { titles, labeledFirstIndex };
}

function extractMinutesSections(minutesText: string): Array<{
  order: number;
  title: string;
  body: string;
}> {
  const parts = [
    ...minutesText.matchAll(
      /(?:^|\n)\s*([一二三四五六七八九十]+)[、.．]\s*([^\n]+)([\s\S]*?)(?=(?:^|\n)\s*[一二三四五六七八九十]+[、.．]|$)/g,
    ),
  ];
  return parts
    .map((m) => ({
      order: CN_NUM[m[1]] || 0,
      title: m[2].trim(),
      body: `${m[2].trim()}\n${m[3].trim()}`.trim(),
    }))
    .filter((s) => s.order > 0 && !/^会议要求/.test(s.title));
}

function extractJointAgendaTopics(agendaText: string): string[] {
  const titles: string[] = [];
  const re =
    /议题([一二三四五六七八九十\d]+)[：:]\s*([^\n]+?)(?:[；;]\s*)?(?=\n|议题提交人|$)/g;
  for (const m of agendaText.matchAll(re)) {
    const t = m[2].replace(/[；;]\s*$/, '').trim();
    if (t && !/负责人|会议决议/.test(t)) titles.push(t);
  }
  return titles;
}

function extractJointResolutionBlock(agendaText: string): string {
  const idx = agendaText.search(/会议决议/);
  if (idx < 0) return '';
  const end = agendaText.slice(idx).search(/\n\s*负责人|\n\s*备\s*注/);
  const block = agendaText
    .slice(idx, idx + (end > 0 ? end : 800))
    .replace(/^会议决议\s*/, '')
    .trim();
  return block;
}

export function buildTopics(
  agendaText: string,
  minutesText: string,
  meetingType: 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE' = 'PARTY_COMMITTEE',
): PartyImportTopicDraft[] {
  const partyAgenda =
    meetingType === 'PARTY_COMMITTEE'
      ? extractAgendaTopics(agendaText)
      : null;
  const agendaTitles =
    meetingType === 'JOINT_CONFERENCE'
      ? extractJointAgendaTopics(agendaText)
      : partyAgenda!.titles;
  const resolutions =
    meetingType === 'JOINT_CONFERENCE'
      ? []
      : extractResolutions(agendaText);
  const jointRes =
    meetingType === 'JOINT_CONFERENCE'
      ? extractJointResolutionBlock(agendaText)
      : '';
  const sections = extractMinutesSections(minutesText);

  const count = Math.max(agendaTitles.length, sections.length, 1);
  const topics: PartyImportTopicDraft[] = [];
  for (let i = 0; i < count; i++) {
    const section = sections[i];
    const title =
      agendaTitles[i] ||
      section?.title ||
      `议题${i + 1}`;
    topics.push({
      sortOrder: i + 1,
      title,
      resolutionSummary:
        resolutions[i] ||
        (i === 0 ? jointRes : '') ||
        '',
      minutesSection: section?.body || '',
      isFirstTopic: false,
    });
  }

  if (meetingType === 'PARTY_COMMITTEE' && topics.length) {
    let firstIdx = partyAgenda?.labeledFirstIndex ?? null;
    if (firstIdx == null) {
      const hit = topics.findIndex((t) => isLikelyFirstTopic(t.title));
      firstIdx = hit >= 0 ? hit : null;
    }
    if (firstIdx != null && topics[firstIdx]) {
      topics[firstIdx].isFirstTopic = true;
    }
  }
  return topics;
}

export function buildMinutesContent(minutesText: string) {
  return minutesText.trim();
}

export function guessMeetingTitle(
  collegeHint: string,
  scheduledAt: Date | null,
  meetingType: 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE' = 'PARTY_COMMITTEE',
  periodNo?: string | null,
) {
  const date = scheduledAt
    ? `${scheduledAt.getFullYear()}年${scheduledAt.getMonth() + 1}月${scheduledAt.getDate()}日`
    : '';
  const college = collegeHint || '学院';
  const kind =
    meetingType === 'JOINT_CONFERENCE' ? '党政联席会议' : '党委会';
  if (periodNo) return `${college}${kind}（${periodNo}）`;
  return `${college}${kind}${date ? `（${date}）` : ''}`;
}
