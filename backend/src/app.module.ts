import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';

@Module({
  // AppModule is the root dependency graph for the NestJS service.
  // Larger systems may import many modules here, but the principle stays the same:
  // wire the application from the top and keep features encapsulated underneath.
  imports: [AiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
