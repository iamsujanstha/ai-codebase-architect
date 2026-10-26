import { Inject, Injectable } from '@nestjs/common';
import { SaveThreadDto } from './dto/save-thread.dto';
import {
  CHAT_THREADS_REPOSITORY_TOKEN,
  IChatThreadsRepository,
} from './repositories/chat-threads.repository.interface';

@Injectable()
export class ChatThreadsService {
  constructor(
    @Inject(CHAT_THREADS_REPOSITORY_TOKEN)
    private readonly threadsRepo: IChatThreadsRepository,
  ) {}

  /** Return all threads for a user, newest first. */
  async getThreadsForUser(userId: string) {
    const numericUserId = parseInt(userId, 10) || 1;
    const rows = await this.threadsRepo.findByUserId(numericUserId);

    return rows.map((r) => ({
      id: r.id.toString(),
      clientThreadId: r.client_thread_id || r.id.toString(),
      title: r.title || 'Untitled Chat',
      messages: (r.chat_messages || []).map((m) => ({
        id: m.id.toString(),
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        status: 'complete',
      })),
      lastMessageAt: r.updated_at.toISOString(),
      model: r.model || undefined,
    }));
  }

  /**
   * Create or fully replace a thread identified by its client-generated UUID.
   */
  async saveThread(userId: string, clientThreadId: string, dto: SaveThreadDto) {
    const numericUserId = parseInt(userId, 10) || 1;

    const thread = await this.threadsRepo.upsertThreadWithMessages(
      numericUserId,
      clientThreadId,
      dto.title,
      dto.model ?? null,
      dto.messages,
    );

    return {
      id: thread.id.toString(),
      clientThreadId: thread.client_thread_id || clientThreadId,
      title: thread.title,
      lastMessageAt: dto.lastMessageAt || thread.updated_at.toISOString(),
    };
  }

  /** Delete a thread — silently succeeds if it doesn't exist. */
  async deleteThread(userId: string, clientThreadId: string): Promise<void> {
    const numericUserId = parseInt(userId, 10) || 1;
    await this.threadsRepo.deleteByClientThreadId(numericUserId, clientThreadId);
  }
}
