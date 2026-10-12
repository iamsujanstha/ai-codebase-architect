import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SaveThreadDto } from './dto/save-thread.dto';

@Injectable()
export class ChatThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Return all threads for a user, newest first. */
  async getThreadsForUser(userId: string) {
    const numericUserId = parseInt(userId, 10) || 1;
    const rows = await this.prisma.chat_threads.findMany({
      where: { user_id: numericUserId },
      include: {
        chat_messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 100,
    });

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

    let thread = await this.prisma.chat_threads.findFirst({
      where: { user_id: numericUserId, client_thread_id: clientThreadId },
    });

    if (!thread) {
      thread = await this.prisma.chat_threads.create({
        data: {
          user_id: numericUserId,
          client_thread_id: clientThreadId,
          title: dto.title,
          model: dto.model ?? null,
        },
      });
    } else {
      thread = await this.prisma.chat_threads.update({
        where: { id: thread.id },
        data: {
          title: dto.title,
          model: dto.model ?? null,
          updated_at: new Date(),
        },
      });
    }

    await this.prisma.chat_messages.deleteMany({
      where: { thread_id: thread.id },
    });

    if (dto.messages && dto.messages.length > 0) {
      await this.prisma.chat_messages.createMany({
        data: dto.messages.map((m) => ({
          thread_id: thread.id,
          role: m.role || 'user',
          content: m.content || '',
          timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
        })),
      });
    }

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
    const thread = await this.prisma.chat_threads.findFirst({
      where: { user_id: numericUserId, client_thread_id: clientThreadId },
    });
    if (thread) {
      await this.prisma.chat_threads.delete({
        where: { id: thread.id },
      });
    }
  }
}
