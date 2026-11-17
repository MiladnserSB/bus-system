import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

export function configureApp(
  app: INestApplication,
  options?: { enableSwagger?: boolean },
): void {
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  app.use(
    helmet({
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
      },
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: configService.get<string[]>('corsOrigins') ?? [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (options?.enableSwagger !== false) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Bus Trip & Seat Booking API')
      .setDescription(
        'الواجهة البرمجية الموحدة لنظام إدارة رحلات وحجز مقاعد شركة النقليات بين المحافظات',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
