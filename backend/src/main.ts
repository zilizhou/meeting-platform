import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !process.env.JWT_SECRET) {
    throw new Error('生产环境必须配置 JWT_SECRET');
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // 反代后正确识别客户端 IP（登录审计 / 锁定 / 限流）
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      // 纯 API：关闭 CSP，避免影响前端同源反代；其余安全头保留
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((s) => s.trim())
      : isProd
        ? false
        : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 生产默认关闭 Swagger；演示排查可设 ENABLE_SWAGGER=1
  const enableSwagger = truthy(process.env.ENABLE_SWAGGER) || !isProd;
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('曲师大双会管理系统 API')
      .setDescription('党委会 / 党政联席会议一体化管理')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT || 3000);
  const host = process.env.BIND_HOST || (isProd ? '127.0.0.1' : '0.0.0.0');
  await app.listen(port, host);
  console.log(`API running at http://${host}:${port}/api`);
  if (enableSwagger) {
    console.log(`Swagger at http://${host}:${port}/api/docs`);
  } else {
    console.log('Swagger disabled (production; set ENABLE_SWAGGER=1 to enable)');
  }
}

bootstrap();
