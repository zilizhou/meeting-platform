export type FrequencyPeriod = 'SEMESTER' | 'MONTH';

export interface PeriodRange {
  start: Date;
  end: Date;
  year: number;
  month: number;
  period: FrequencyPeriod;
  key: string;
  label: string;
}

/** 春季学期 2/1–8/1，秋季学期 8/1–次年 2/1；自然月按日历月 */
export function currentPeriodRange(
  period: FrequencyPeriod = 'SEMESTER',
  now = new Date(),
): PeriodRange {
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const month = monthIndex + 1;

  if (period === 'MONTH') {
    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
    return {
      start,
      end,
      year,
      month,
      period,
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${year}年${month}月`,
    };
  }

  if (monthIndex >= 1 && monthIndex <= 6) {
    return {
      start: new Date(year, 1, 1, 0, 0, 0, 0),
      end: new Date(year, 7, 1, 0, 0, 0, 0),
      year,
      month,
      period,
      key: `${year}-SPRING`,
      label: `${year}年春季学期`,
    };
  }
  if (monthIndex >= 7) {
    return {
      start: new Date(year, 7, 1, 0, 0, 0, 0),
      end: new Date(year + 1, 1, 1, 0, 0, 0, 0),
      year,
      month,
      period,
      key: `${year}-AUTUMN`,
      label: `${year}年秋季学期`,
    };
  }
  return {
    start: new Date(year - 1, 7, 1, 0, 0, 0, 0),
    end: new Date(year, 1, 1, 0, 0, 0, 0),
    year,
    month,
    period,
    key: `${year - 1}-AUTUMN`,
    label: `${year - 1}年秋季学期`,
  };
}
