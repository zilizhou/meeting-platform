import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';

export interface LlmChatResult {
  text: string;
  provider: string;
  model: string;
  demo: boolean;
}

export interface LlmChatOptions {
  demoKind?: 'material_summary' | 'minutes_draft';
  /** 网络不可达时回退本地演示，避免整条 AI 链路不可用 */
  fallbackOnNetworkError?: boolean;
  /** 若提供则走 OpenAI 兼容 SSE，边生成边回调 */
  onToken?: (text: string) => void;
}

/** 与 zxyun 一致：绕过本机 Clash Fake-IP（198.18.0.x）导致的 fetch failed */
const DEFAULT_DASHSCOPE_IPV4 = '39.96.198.249';

@Injectable()
export class LlmProvider {
  private readonly logger = new Logger(LlmProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('LLM_API_KEY')?.trim());
  }

  status() {
    const key = this.config.get<string>('LLM_API_KEY')?.trim();
    return {
      configured: Boolean(key),
      provider: key
        ? this.config.get<string>('LLM_PROVIDER') || 'openai_compatible'
        : 'demo',
      model: this.config.get<string>('LLM_MODEL') || 'gpt-4o-mini',
      baseUrl:
        this.config.get<string>('LLM_BASE_URL') ||
        'https://api.openai.com/v1',
      endpointIpv4:
        this.config.get<string>('LLM_ENDPOINT_IPV4')?.trim() ||
        DEFAULT_DASHSCOPE_IPV4,
    };
  }

  async chat(
    system: string,
    user: string,
    options?: LlmChatOptions,
  ): Promise<LlmChatResult> {
    const demoKind = options?.demoKind || 'material_summary';
    const fallbackOnNetworkError = options?.fallbackOnNetworkError !== false;
    const apiKey = this.config.get<string>('LLM_API_KEY')?.trim();
    if (!apiKey) {
      const text =
        demoKind === 'minutes_draft'
          ? this.demoMinutesDraft(user)
          : this.demoSummary(user);
      this.emitDemoTokens(text, options?.onToken);
      return {
        text,
        provider: 'demo',
        model: 'local-heuristic',
        demo: true,
      };
    }

    const baseUrl = (
      this.config.get<string>('LLM_BASE_URL') || 'https://api.openai.com/v1'
    ).replace(/\/$/, '');
    const model = this.config.get<string>('LLM_MODEL') || 'gpt-4o-mini';
    const provider =
      this.config.get<string>('LLM_PROVIDER') || 'openai_compatible';
    const url = `${baseUrl}/chat/completions`;
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    try {
      if (options?.onToken) {
        const text = await this.postChatCompletionsStream(
          url,
          apiKey,
          {
            model,
            temperature: 0.2,
            stream: true,
            messages,
          },
          options.onToken,
        );
        if (!text.trim()) {
          throw new BadRequestException('大模型返回为空');
        }
        return { text, provider, model, demo: false };
      }

      const res = await this.postChatCompletions(url, apiKey, {
        model,
        temperature: 0.2,
        messages,
      });

      if (!res.ok) {
        this.logger.warn(
          `LLM 调用失败 ${res.status}: ${res.text.slice(0, 300)}`,
        );
        throw new BadRequestException(
          `大模型调用失败（HTTP ${res.status}）。请检查 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL`,
        );
      }

      let data: any;
      try {
        data = JSON.parse(res.text);
      } catch {
        throw new BadRequestException('大模型返回非 JSON');
      }
      const text = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!text) {
        throw new BadRequestException('大模型返回为空');
      }

      return { text, provider, model, demo: false };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`LLM 网络异常: ${e?.message || e}`);
      if (fallbackOnNetworkError) {
        const demoText =
          demoKind === 'minutes_draft'
            ? this.demoMinutesDraft(user)
            : this.demoSummary(user);
        const text =
          `【大模型暂不可达，已回退本地演示】\n` +
          `原因：${e?.message || '网络错误'}\n\n` +
          demoText;
        this.emitDemoTokens(text, options?.onToken);
        return {
          text,
          provider: 'demo_fallback',
          model: 'local-heuristic',
          demo: true,
        };
      }
      throw new BadRequestException(
        `大模型服务不可达：${e?.message || '网络错误'}。请检查网络、代理或 LLM_BASE_URL`,
      );
    }
  }

  private emitDemoTokens(text: string, onToken?: (t: string) => void) {
    if (!onToken || !text) return;
    const chunkSize = 24;
    for (let i = 0; i < text.length; i += chunkSize) {
      onToken(text.slice(i, i + chunkSize));
    }
  }

  /**
   * 参考 zxyun apps/teaching：DashScope 直连固定 IPv4 + SNI，
   * 避免本机代理 Fake-IP（198.18.0.x）导致 Node fetch failed。
   */
  private postChatCompletions(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; text: string }> {
    return this.requestChatCompletions(url, apiKey, body).then((res) => {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          resolve({ ok: status >= 200 && status < 300, status, text });
        });
        res.on('error', reject);
      });
    });
  }

  private postChatCompletionsStream(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
    onToken: (text: string) => void,
  ): Promise<string> {
    return this.requestChatCompletions(url, apiKey, body).then((res) => {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) {
        return new Promise<string>((_resolve, reject) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            this.logger.warn(
              `LLM 流式调用失败 ${status}: ${text.slice(0, 300)}`,
            );
            reject(
              new BadRequestException(
                `大模型调用失败（HTTP ${status}）。请检查 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL`,
              ),
            );
          });
          res.on('error', reject);
        });
      }

      return new Promise<string>((resolve, reject) => {
        let buffer = '';
        let full = '';
        const flushLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) return;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const piece = String(
              json?.choices?.[0]?.delta?.content ??
                json?.choices?.[0]?.message?.content ??
                '',
            );
            if (piece) {
              full += piece;
              onToken(piece);
            }
          } catch {
            /* ignore malformed sse chunk */
          }
        };

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          buffer = buffer.replace(/\r\n/g, '\n');
          let idx: number;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            flushLine(line);
          }
        });
        res.on('end', () => {
          if (buffer.trim()) flushLine(buffer);
          resolve(full.trim());
        });
        res.on('error', reject);
      });
    });
  }

  private requestChatCompletions(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<IncomingMessage> {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const endpointIp =
      this.config.get<string>('LLM_ENDPOINT_IPV4')?.trim() ||
      DEFAULT_DASHSCOPE_IPV4;
    const timeoutMs = Math.max(
      5000,
      Number(this.config.get<string>('LLM_TIMEOUT_MS') || '45000'),
    );
    const useFixedIp = parsed.hostname === 'dashscope.aliyuncs.com';
    const connectHost = useFixedIp ? endpointIp : parsed.hostname;

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          protocol: parsed.protocol,
          host: connectHost,
          servername: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: 'POST',
          agent: false,
          headers: {
            Host: parsed.hostname,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Accept: body.stream ? 'text/event-stream' : 'application/json',
            Connection: 'close',
          },
        },
        (res) => resolve(res),
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`LLM 请求超时 ${timeoutMs}ms`));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /** 无密钥时的本地启发式摘要，便于演示链路 */
  private demoSummary(userPrompt: string) {
    const titleMatch = userPrompt.match(/议题标题[：:]\s*(.+)/);
    const typeMatch = userPrompt.match(/会议类型[：:]\s*(.+)/);
    const title = titleMatch?.[1]?.trim() || '（未识别标题）';
    const meetingType = typeMatch?.[1]?.trim() || '未知';

    const materialBlocks = [
      ...userPrompt.matchAll(/【材料[：:]([^\]]+)】[\s\S]*?(?=【材料[：:]|$)/g),
    ];
    const names = materialBlocks.map((m) => m[1].trim()).filter(Boolean);
    const body = userPrompt.replace(/\s+/g, ' ').slice(0, 400);

    const lines = [
      '【演示模式摘要 · 未配置 LLM_API_KEY】',
      '',
      '一、背景与诉求',
      `- 议题：${title}`,
      `- 会议类型：${meetingType}`,
      `- 材料摘录：${body.slice(0, 180)}${body.length > 180 ? '…' : ''}`,
      '',
      '二、关键影响（需人工核对原文）',
      '- 人事/编制：原文未自动识别，请人工确认',
      '- 经费/资产：原文未自动识别，请人工确认',
      '',
      '三、材料齐备情况',
      names.length
        ? names.map((n) => `- ${n}`).join('\n')
        : '- 暂无可解析文本材料（可上传 .txt 或配置大模型后解析 PDF/Word）',
      '',
      '四、审题关注点（提示，非结论）',
      '- 是否需党委会前置 / 联席会落实，请对照议事规则人工判断',
      '- 是否存在回避情形、临时动议或紧急临机标记',
      '',
      '五、声明',
      '本摘要由系统演示逻辑生成，不能替代原文与制度审核。配置 LLM_API_KEY 后将调用大模型生成正式辅读摘要。',
    ];
    return lines.join('\n');
  }

  private demoMinutesDraft(userPrompt: string) {
    const titleMatch = userPrompt.match(/会议标题[：:]\s*(.+)/);
    const typeMatch = userPrompt.match(/会议类型[：:]\s*(.+)/);
    const title = titleMatch?.[1]?.trim() || '（未识别会议）';
    const meetingType = typeMatch?.[1]?.trim() || '未知';
    const topicBlocks = [
      ...userPrompt.matchAll(/【议题\d+[：:]([^\]]+)】[\s\S]*?(?=【议题\d+[：:]|$)/g),
    ];
    const topicLines =
      topicBlocks.length > 0
        ? topicBlocks
            .map((m, i) => {
              const name = m[1].trim();
              const body = m[0].replace(/\s+/g, ' ').slice(0, 160);
              return `${i + 1}. ${name}\n   议决情况（据系统记录整理，须人工核对）：${body}`;
            })
            .join('\n\n')
        : '1. （暂无议题明细，请秘书根据会议记录补写）';

    return [
      `【演示模式纪要初稿 · 未配置 LLM_API_KEY】`,
      '',
      `${title}`,
      `会议类型：${meetingType}`,
      '',
      '一、会议概况',
      '根据系统签到与议程记录整理（演示稿）。应到、实到、主持人等信息请秘书核对后补全。',
      '',
      '二、议题议决',
      topicLines,
      '',
      '三、其他事项',
      '无。',
      '',
      '四、声明',
      '本稿由系统演示逻辑生成，须会议秘书核对修改后保存。系统不办理线上签署生效。',
    ].join('\n');
  }
}
