import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiGatewayService } from './ai.service';

// Feature modules are one of NestJS's strongest organizational tools.
// They let us group controllers and providers by business capability instead of by file type alone.
@Module({
  controllers: [AiController],
  providers: [AiGatewayService],
})
export class AiModule {}

