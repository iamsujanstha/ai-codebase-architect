import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AiController } from './ai.controller';
import { AiGatewayService } from './ai.service';
import { ChatThreadsController } from './chat-threads.controller';
import { ChatThreadsService } from './chat-threads.service';
import { ChatThread, ChatThreadSchema } from './schemas/chat-thread.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PassportModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: ChatThread.name, schema: ChatThreadSchema },
    ]),
  ],
  controllers: [AiController, ChatThreadsController],
  providers: [AiGatewayService, ChatThreadsService],
})
export class AiModule {}
