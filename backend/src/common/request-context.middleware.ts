import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  clientIpFromReq,
  requestContext,
} from '../common/request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const store = {
      ip: clientIpFromReq(req),
      userAgent: String(req.headers['user-agent'] || ''),
      path: req.originalUrl || req.url,
      method: req.method,
    };
    requestContext.run(store, () => next());
  }
}
