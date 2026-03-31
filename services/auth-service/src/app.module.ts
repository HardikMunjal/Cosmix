import { Module } from '@nestjs/common';
import { LoginModule } from './modules/login/login.module';

@Module({
  imports: [LoginModule],
})
export class AppModule {}