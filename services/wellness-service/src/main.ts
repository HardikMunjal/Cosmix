import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3004, '0.0.0.0');
  console.log('Wellness Service running on http://localhost:3004');
}

bootstrap();