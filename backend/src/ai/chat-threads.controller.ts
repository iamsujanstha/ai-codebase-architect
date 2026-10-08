import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatThreadsService } from './chat-threads.service';
import { SaveThreadDto } from './dto/save-thread.dto';

/**
 * ChatThreadsController — REST endpoints for authenticated chat history.
 *
 * All routes require a valid JWT. The userId is extracted from the token
 * so clients can never read or write another user's threads.
 */
@Controller('ai/threads')
@UseGuards(AuthGuard('jwt'))
export class ChatThreadsController {
  constructor(private readonly threadsService: ChatThreadsService) {}

  /** GET /ai/threads — list all threads for the authenticated user */
  @Get()
  async getMyThreads(@Req() req: any) {
    const userId = req.user?._id?.toString() ?? req.user?.id?.toString();
    const threads = await this.threadsService.getThreadsForUser(userId);

    // Map to the shape the frontend expects — use clientThreadId as the id
    return threads.map((t) => ({
      id: t.clientThreadId,
      title: t.title,
      messages: t.messages,
      lastMessageAt: t.lastMessageAt,
      model: t.model ?? undefined,
    }));
  }

  /** PUT /ai/threads/:threadId — create or replace a thread */
  @Put(':threadId')
  async saveThread(
    @Req() req: any,
    @Param('threadId') threadId: string,
    @Body() dto: SaveThreadDto,
  ) {
    const userId = req.user?._id?.toString() ?? req.user?.id?.toString();
    const thread = await this.threadsService.saveThread(userId, threadId, dto);
    return {
      id: thread.clientThreadId,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
    };
  }

  /** DELETE /ai/threads/:threadId — delete a thread */
  @Delete(':threadId')
  async deleteThread(@Req() req: any, @Param('threadId') threadId: string) {
    const userId = req.user?._id?.toString() ?? req.user?.id?.toString();
    await this.threadsService.deleteThread(userId, threadId);
    return { deleted: true };
  }
}
