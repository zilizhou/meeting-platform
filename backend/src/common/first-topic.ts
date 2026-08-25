import { BadRequestException } from '@nestjs/common';
import { MeetingType } from './constants';

export const FIRST_TOPIC_CODE = 'FIRST_TOPIC';

export function topicHasFirstTopicCategory(
  topics: Array<{ category?: { code?: string | null } | null }>,
) {
  return topics.some((t) => t.category?.code === FIRST_TOPIC_CODE);
}

/** 党组织会议无第一议题不得开会（开始/签到转进行中） */
export function assertPartyMeetingCanOpen(
  meetingType: string,
  topics: Array<{ category?: { code?: string | null } | null }>,
) {
  if (meetingType !== MeetingType.PARTY_COMMITTEE) return;
  if (!topicHasFirstTopicCategory(topics)) {
    throw new BadRequestException(
      '党组织会议须将「第一议题（政治理论学习）」纳入议程后方可开会',
    );
  }
}
