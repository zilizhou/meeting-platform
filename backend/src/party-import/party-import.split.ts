import { ImportAlignStatus, ImportMeetingType } from './party-import.types';
import { parseDateTime } from './party-import.parser';

export type DocSegment = {
  dateKey: string | null;
  scheduledAt: Date | null;
  periodNo: string | null;
  text: string;
};

export function toDateKey(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function detectMeetingType(
  agendaText: string,
  recordText: string,
  minutesText: string,
  hint?: string,
): ImportMeetingType {
  if (hint === 'PARTY_COMMITTEE' || hint === 'JOINT_CONFERENCE') return hint;
  const blob = `${agendaText}\n${recordText}\n${minutesText}`;
  if (/党政联席/.test(blob)) return 'JOINT_CONFERENCE';
  return 'PARTY_COMMITTEE';
}

function extractPeriodNo(text: string): string | null {
  // 优先「第N次」，避免纪要抬头「第N期」与正文次数不一致时串场
  const once = text.match(/(\d{4})\s*年\s*第\s*(\d+)\s*次/);
  if (once) return `${once[1]}年第${once[2]}次`;
  const issue =
    text.match(/（\s*(\d{4})\s*年\s*第\s*(\d+)\s*期\s*）/) ||
    text.match(/\(\s*(\d{4})\s*年\s*第\s*(\d+)\s*期\s*\)/);
  if (issue) return `${issue[1]}年第${issue[2]}次`;
  return null;
}

/** 取文段中第一个日期（避免合订本把下一场的「时间：」算进来） */
function parseFirstDateTime(text: string): Date | null {
  const re =
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|晚上)?\s*(\d{1,2})\s*[：:时]\s*(\d{1,2})?)?/;
  const m = text.match(re);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let hour = m[5] ? Number(m[5]) : 9;
  const minute = m[6] ? Number(m[6]) : 0;
  if (m[4] === '下午' && hour < 12) hour += 12;
  if (m[4] === '晚上' && hour < 12) hour += 12;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function splitByRegexKeep(text: string, re: RegExp): string[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  const matches = [...text.matchAll(global)];
  if (!matches.length) return text.trim() ? [text.trim()] : [];
  const out: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const slice = text.slice(start, end).trim();
    if (slice) out.push(slice);
  }
  return out;
}

function toSegment(text: string, preferFirstDate = false): DocSegment {
  const scheduledAt = preferFirstDate
    ? parseFirstDateTime(text)
    : parseDateTime(text);
  return {
    text,
    scheduledAt,
    dateKey: toDateKey(scheduledAt),
    periodNo: extractPeriodNo(text),
  };
}

/** 议题表：联席按「…党政联席会议题表」切开；党组织整份或按党委会议题表切开 */
export function splitAgendaSegments(
  text: string,
  meetingType: ImportMeetingType,
): DocSegment[] {
  if (!text.trim()) return [];
  if (meetingType === 'JOINT_CONFERENCE') {
    const parts = splitByRegexKeep(text, /[^\n]*学院党政联席会议题表/g);
    return parts
      .map((t) => toSegment(t))
      .filter((s) => s.dateKey || s.text.length > 40);
  }
  const parts = splitByRegexKeep(
    text,
    /[^\n]*学院党委会议题表|[^\n]*党组织会议议题表/g,
  );
  if (parts.length > 1) return parts.map((t) => toSegment(t));
  return [toSegment(text)];
}

/** 会议记录：联席优先按「时间：YYYY年」切开（时间在标题之前） */
export function splitRecordSegments(
  text: string,
  meetingType: ImportMeetingType,
): DocSegment[] {
  if (!text.trim()) return [];
  if (meetingType === 'JOINT_CONFERENCE') {
    const byTime = splitByRegexKeep(text, /时间[：:]\s*\d{4}\s*年/g);
    if (byTime.length >= 2) {
      return byTime.map((t) => toSegment(t, true));
    }
    const parts = splitByRegexKeep(
      text,
      /[^\n]*党政联席会议（\s*\d{4}\s*年\s*第\s*\d+\s*次\s*）/g,
    );
    return parts.map((t) => toSegment(t, true));
  }
  return [toSegment(text)];
}

/** 纪要：联席按「党政联席会议纪要」切开 */
export function splitMinutesSegments(
  text: string,
  meetingType: ImportMeetingType,
): DocSegment[] {
  if (!text.trim()) return [];
  if (meetingType === 'JOINT_CONFERENCE') {
    const parts = splitByRegexKeep(text, /党政联席会议纪要/g);
    return parts
      .map((t) => toSegment(t, true))
      .filter((s) => s.text.length > 20);
  }
  return [toSegment(text)];
}

export type AlignedBundle = {
  key: string;
  dateKey: string | null;
  scheduledAt: Date | null;
  periodNo: string | null;
  agendaText: string;
  recordText: string;
  minutesText: string;
  alignStatus: ImportAlignStatus;
  /** 规则 B：三件套日期齐全才默认勾选 */
  selected: boolean;
};

export function alignSegments(
  agendas: DocSegment[],
  records: DocSegment[],
  minutesList: DocSegment[],
): AlignedBundle[] {
  type Acc = {
    dateKey: string | null;
    scheduledAt: Date | null;
    periodNo: string | null;
    agendaText: string;
    recordText: string;
    minutesText: string;
  };
  const byDate = new Map<string, Acc>();
  const byPeriod = new Map<string, string>(); // period -> dateKey

  const ensure = (dateKey: string | null, periodNo: string | null, scheduledAt: Date | null) => {
    const key =
      dateKey ||
      (periodNo ? `period:${periodNo}` : null) ||
      `orphan-${byDate.size + 1}`;
    let cur = byDate.get(key);
    if (!cur) {
      cur = {
        dateKey,
        scheduledAt,
        periodNo,
        agendaText: '',
        recordText: '',
        minutesText: '',
      };
      byDate.set(key, cur);
    }
    if (scheduledAt && !cur.scheduledAt) cur.scheduledAt = scheduledAt;
    if (dateKey && !cur.dateKey) cur.dateKey = dateKey;
    if (periodNo && !cur.periodNo) cur.periodNo = periodNo;
    if (periodNo && cur.dateKey) byPeriod.set(periodNo, cur.dateKey);
    if (periodNo && dateKey) byPeriod.set(periodNo, dateKey);
    return key;
  };

  const put = (
    seg: DocSegment,
    field: 'agendaText' | 'recordText' | 'minutesText',
  ) => {
    // 有期次且已建立 period→date 映射时，归并到日期桶
    let dateKey = seg.dateKey;
    if (!dateKey && seg.periodNo && byPeriod.has(seg.periodNo)) {
      dateKey = byPeriod.get(seg.periodNo)!;
    }
    const key = ensure(dateKey, seg.periodNo, seg.scheduledAt);
    const cur = byDate.get(key)!;
    if (field === 'agendaText') cur.agendaText = seg.text;
    if (field === 'recordText') cur.recordText = seg.text;
    if (field === 'minutesText') cur.minutesText = seg.text;
    if (seg.periodNo) cur.periodNo = cur.periodNo || seg.periodNo;
    if (seg.dateKey) cur.dateKey = cur.dateKey || seg.dateKey;
    if (seg.scheduledAt && !cur.scheduledAt) cur.scheduledAt = seg.scheduledAt;
    if (cur.periodNo && cur.dateKey) byPeriod.set(cur.periodNo, cur.dateKey);
  };

  // 先纪要/记录（常带期次+日期），再建映射，最后议题表按日期归并
  for (const s of minutesList) put(s, 'minutesText');
  for (const s of records) put(s, 'recordText');
  for (const s of agendas) put(s, 'agendaText');

  // 二次归并：period:xxx 桶若能映射到日期桶则合并
  for (const [key, cur] of [...byDate.entries()]) {
    if (!key.startsWith('period:')) continue;
    const period = cur.periodNo;
    if (!period) continue;
    const dateKey = byPeriod.get(period);
    if (!dateKey || dateKey === key) continue;
    const target = byDate.get(dateKey);
    if (!target) continue;
    if (!target.agendaText && cur.agendaText) target.agendaText = cur.agendaText;
    if (!target.recordText && cur.recordText) target.recordText = cur.recordText;
    if (!target.minutesText && cur.minutesText) {
      target.minutesText = cur.minutesText;
    }
    if (!target.periodNo) target.periodNo = cur.periodNo;
    if (!target.scheduledAt) target.scheduledAt = cur.scheduledAt;
    byDate.delete(key);
  }

  const bundles: AlignedBundle[] = [];
  for (const [key, v] of byDate) {
    const hasA = !!v.agendaText.trim();
    const hasR = !!v.recordText.trim();
    const hasM = !!v.minutesText.trim();
    let alignStatus: ImportAlignStatus;
    if (hasA && hasR && hasM) alignStatus = 'ok';
    else if (!hasA) alignStatus = 'missing_agenda';
    else if (hasR || hasM) alignStatus = 'partial';
    else alignStatus = 'agenda_only';

    bundles.push({
      key: v.dateKey || key,
      dateKey: v.dateKey,
      scheduledAt: v.scheduledAt,
      periodNo: v.periodNo,
      agendaText: v.agendaText,
      recordText: v.recordText,
      minutesText: v.minutesText,
      alignStatus,
      selected: alignStatus === 'ok',
    });
  }

  bundles.sort((a, b) => {
    if (a.dateKey && b.dateKey) return a.dateKey.localeCompare(b.dateKey);
    if (a.dateKey) return -1;
    if (b.dateKey) return 1;
    return a.key.localeCompare(b.key);
  });
  return bundles;
}
