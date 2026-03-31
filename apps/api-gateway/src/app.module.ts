import { Module } from '@nestjs/common';
import { LoginModule } from '../../../services/auth-service/src/modules/login/login.module';
import { ChatModule } from '../../../services/chat-service/src/modules/chat/chat.module';
import { UsersModule } from '../../../services/user-service/src/modules/users/users.module';

@Module({
  imports: [
    LoginModule,
    ChatModule,
    UsersModule,
  ],
})
export class AppModule {}