import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*', // change in prod
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  await app.listen(3002);
  console.log('🚀 Chat Service running on http://localhost:3002');
}
bootstrap();