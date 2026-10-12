import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AiController } from './ai.controller';
import { AiGatewayService } from './ai.service';
import { ChatThreadsController } from './chat-threads.controller';
import { ChatThreadsService } from './chat-threads.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [PassportModule, AuthModule, DatabaseModule],
  controllers: [AiController, ChatThreadsController],
  providers: [AiGatewayService, ChatThreadsService],
})
export class AiModule {}
