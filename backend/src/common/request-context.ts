import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore {
  return requestContext.getStore() || {};
}

export function clientIpFromReq(req: {
  headers: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress;
}
