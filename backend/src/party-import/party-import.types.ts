export type PartyImportPersonAction = 'link' | 'create';

export type ImportMeetingType = 'PARTY_COMMITTEE' | 'JOINT_CONFERENCE';

export type ImportAlignStatus =
  | 'ok'
  | 'partial'
  | 'agenda_only'
  | 'missing_agenda';

export interface PartyImportTopicDraft {
  sortOrder: number;
  title: string;
  resolutionSummary: string;
  minutesSection: string;
  /** 党组织会议：是否识别为「第一议题（政治理论学习）」 */
  isFirstTopic?: boolean;
}

export interface PartyImportPersonDraft {
  name: string;
  userId?: string;
  username?: string;
  action: PartyImportPersonAction;
  isFormal: boolean;
  status: 'attend' | 'leave' | 'absent' | 'avoid';
}

/** 单场会议草案（党组织 1 场；联席合订本 N 场） */
export interface MeetingImportDraft {
  key: string;
  selected: boolean;
  alignStatus: ImportAlignStatus;
  periodNo: string | null;
  scheduledAt: string | null;
  location: string;
  title: string;
  hostName: string;
  recorderName: string;
  topics: PartyImportTopicDraft[];
  people: PartyImportPersonDraft[];
  minutesContent: string;
  warnings: string[];
  raw: {
    agendaText: string;
    recordText: string;
    minutesText: string;
  };
}

/** 批次预览：统一接口返回结构 */
export interface MeetingImportPreview {
  meetingType: ImportMeetingType;
  collegeNameHint: string;
  collegeId: string | null;
  collegeName: string | null;
  warnings: string[];
  meetings: MeetingImportDraft[];
  /** 本批默认勾选 / 未勾选统计 */
  stats: {
    total: number;
    selected: number;
    unselected: number;
    /** 党组织：已识别第一议题的场次数 */
    withFirstTopic: number;
    /** 党组织：勾选场次中缺第一议题的数量 */
    missingFirstTopic: number;
  };
}

export interface MeetingImportConfirmDto {
  meetingType: ImportMeetingType;
  collegeId?: string;
  meetings: MeetingImportDraft[];
}

/** @deprecated 兼容旧单场结构；新接口使用 MeetingImportPreview */
export type PartyImportPreview = MeetingImportDraft & {
  collegeNameHint: string;
  collegeId: string | null;
  collegeName: string | null;
};

export type PartyImportConfirmDto = MeetingImportDraft & {
  collegeId?: string;
};
