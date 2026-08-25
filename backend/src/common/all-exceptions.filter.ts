import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 生产环境不回传堆栈与内部异常细节；业务 HttpException 仍按原 message 返回。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : body;
      res.status(status).json(payload);
      return;
    }

    const err = exception as Error;
    this.logger.error(
      `${req.method} ${req.originalUrl || req.url} → ${err?.message || exception}`,
      err?.stack,
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProd ? '服务器内部错误' : err?.message || 'Internal server error',
      ...(isProd ? {} : { error: err?.name, stack: err?.stack }),
    });
  }
}
