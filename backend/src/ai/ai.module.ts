import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AiController } from './ai.controller';
import { AiGatewayService } from './ai.service';
import { ChatThreadsController } from './chat-threads.controller';
import { ChatThreadsService } from './chat-threads.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';

import { PostgresChatThreadsRepository } from './repositories/postgres-chat-threads.repository';
import { CHAT_THREADS_REPOSITORY_TOKEN } from './repositories/chat-threads.repository.interface';

@Module({
  imports: [PassportModule, AuthModule, DatabaseModule],
  controllers: [AiController, ChatThreadsController],
  providers: [
    AiGatewayService,
    ChatThreadsService,
    PostgresChatThreadsRepository,
    {
      provide: CHAT_THREADS_REPOSITORY_TOKEN,
      useClass: PostgresChatThreadsRepository,
    },
  ],
  exports: [CHAT_THREADS_REPOSITORY_TOKEN, PostgresChatThreadsRepository],
})
export class AiModule {}
