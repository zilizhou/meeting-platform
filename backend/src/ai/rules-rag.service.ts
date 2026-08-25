import { Injectable } from '@nestjs/common';
import { RULE_CHUNKS, RuleChunk } from './rules-knowledge';

export interface RankedChunk {
  chunk: RuleChunk;
  score: number;
}

@Injectable()
export class RulesRagService {
  list() {
    return RULE_CHUNKS.map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source,
      keywords: c.keywords,
    }));
  }

  retrieve(question: string, topK = 4): RankedChunk[] {
    const q = question.trim().toLowerCase();
    if (!q) return [];

    const tokens = q
      .split(/[\s,，。？?！!、；;：:（）()【】\[\]/\\]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 1);

    const ranked = RULE_CHUNKS.map((chunk) => {
      let score = 0;
      const hay = `${chunk.title} ${chunk.keywords.join(' ')} ${chunk.content}`.toLowerCase();
      for (const kw of chunk.keywords) {
        if (q.includes(kw.toLowerCase())) score += 6;
      }
      for (const t of tokens) {
        if (t.length < 2) continue;
        if (hay.includes(t)) score += 2;
        if (chunk.title.toLowerCase().includes(t)) score += 3;
      }
      // 常见同义
      if (/缺席|未到会/.test(q) && chunk.id === 'absent') score += 8;
      if (/列席/.test(q) && chunk.id === 'attendees') score += 6;
      if (/临时/.test(q) && chunk.id === 'temp-motion') score += 8;
      if (/纪要|双签|签署/.test(q) && chunk.id === 'minutes-sign') score += 6;
      if (/法定|到会人数|半数|三分之二/.test(q) && chunk.id === 'quorum') score += 8;
      if (/回避/.test(q) && chunk.id === 'avoid') score += 8;
      if (/催办|督办|逾期/.test(q) && chunk.id === 'supervision') score += 6;
      if (/紧急|临机/.test(q) && chunk.id === 'emergency') score += 8;
      if (/替代|边界|前置/.test(q) && chunk.id === 'dual-boundary') score += 6;
      return { chunk, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked.slice(0, topK);
  }

  /** 无大模型时的确定性回答 */
  demoAnswer(question: string, hits: RankedChunk[]) {
    if (!hits.length) {
      return [
        '未在内置议事规则知识库中检索到足够相关条文。',
        '建议换个问法，或咨询学院办公室 / 党委组织部。',
        '',
        '可尝试询问：法定人数、列席有无表决权、临时动议、缺席意见、会议纪要、回避、督办等。',
      ].join('\n');
    }

    const lines = [
      `【规则问答 · 演示检索】针对：「${question.trim()}」`,
      '',
      '依据检索到的制度要点：',
    ];
    hits.forEach((h, i) => {
      lines.push('');
      lines.push(`${i + 1}. ${h.chunk.title}（${h.chunk.source}）`);
      lines.push(h.chunk.content);
    });
    lines.push('');
    lines.push(
      '声明：以上为系统内置知识检索结果，供办事参考；具体适用请以正式文件及组织部门解释为准。配置大模型后将基于相同出处生成更通顺的综合答复。',
    );
    return lines.join('\n');
  }
}
