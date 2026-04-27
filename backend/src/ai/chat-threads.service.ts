import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatThread, ChatThreadDocument } from './schemas/chat-thread.schema';
import { SaveThreadDto } from './dto/save-thread.dto';

/**
 * ChatThreadsService — owns all persistence for user chat history.
 *
 * SRP: this service only knows about chat thread storage.
 *      AI generation stays in AiGatewayService.
 */
@Injectable()
export class ChatThreadsService {
  constructor(
    @InjectModel(ChatThread.name)
    private readonly threadModel: Model<ChatThreadDocument>,
  ) {}

  /** Return all threads for a user, newest first. */
  async getThreadsForUser(userId: string): Promise<ChatThreadDocument[]> {
    return this.threadModel
      .find({ userId })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .exec();
  }

  /**
   * Create or fully replace a thread identified by its client-generated UUID.
   *
   * Using clientThreadId as the upsert key means:
   * - First save creates the document.
   * - Every subsequent save replaces it with the latest full state.
   * - No duplicate threads are created for the same conversation.
   */
  async saveThread(
    userId: string,
    clientThreadId: string,
    dto: SaveThreadDto,
  ): Promise<ChatThreadDocument> {
    const thread = await this.threadModel
      .findOneAndUpdate(
        { userId, clientThreadId },
        {
          $set: {
            userId,
            clientThreadId,
            title: dto.title,
            // Only save completed messages — never persist a streaming placeholder
            messages: dto.messages.map((m) => ({
              ...m,
              status: m.status === 'streaming' ? 'complete' : m.status,
              content: m.content ?? '',
            })),
            lastMessageAt: dto.lastMessageAt,
            model: dto.model ?? null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return thread!;
  }

  /** Delete a thread — silently succeeds if it doesn't exist. */
  async deleteThread(userId: string, clientThreadId: string): Promise<void> {
    await this.threadModel.deleteOne({ userId, clientThreadId }).exec();
  }
}
