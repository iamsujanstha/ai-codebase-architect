import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  ChatThreadRecord,
  IChatThreadsRepository,
  SaveChatMessageData,
} from './chat-threads.repository.interface';

@Injectable()
export class PostgresChatThreadsRepository implements IChatThreadsRepository {
  constructor(private readonly pg: PostgresService) {}

  async findByUserId(userId: number): Promise<ChatThreadRecord[]> {
    const sql = `
      SELECT 
        t.id,
        t.user_id,
        t.title,
        t.created_at,
        t.updated_at,
        t.client_thread_id,
        t.model,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', m.id,
                'thread_id', m.thread_id,
                'role', m.role,
                'content', m.content,
                'timestamp', m.timestamp
              ) ORDER BY m.timestamp ASC
            )
            FROM chat_messages m
            WHERE m.thread_id = t.id
          ),
          '[]'::json
        ) AS chat_messages
      FROM chat_threads t
      WHERE t.user_id = $1
      ORDER BY t.updated_at DESC
      LIMIT 100;
    `;
    const res = await this.pg.query<ChatThreadRecord>(sql, [userId]);
    return res.rows;
  }

  async upsertThreadWithMessages(
    userId: number,
    clientThreadId: string,
    title: string,
    model?: string | null,
    messages?: SaveChatMessageData[],
  ): Promise<ChatThreadRecord> {
    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');

      const findSql = `
        SELECT id, user_id, title, created_at, updated_at, client_thread_id, model
        FROM chat_threads
        WHERE user_id = $1 AND client_thread_id = $2
        LIMIT 1;
      `;
      const findRes = await client.query(findSql, [userId, clientThreadId]);
      let thread = findRes.rows[0];

      if (!thread) {
        const insertSql = `
          INSERT INTO chat_threads (user_id, client_thread_id, title, model, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          RETURNING id, user_id, title, created_at, updated_at, client_thread_id, model;
        `;
        const insertRes = await client.query(insertSql, [
          userId,
          clientThreadId,
          title,
          model ?? null,
        ]);
        thread = insertRes.rows[0];
      } else {
        const updateSql = `
          UPDATE chat_threads
          SET title = $1, model = $2, updated_at = NOW()
          WHERE id = $3
          RETURNING id, user_id, title, created_at, updated_at, client_thread_id, model;
        `;
        const updateRes = await client.query(updateSql, [
          title,
          model ?? null,
          thread.id,
        ]);
        thread = updateRes.rows[0];
      }

      await client.query(`DELETE FROM chat_messages WHERE thread_id = $1;`, [
        thread.id,
      ]);

      if (messages && messages.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];

        messages.forEach((m, idx) => {
          const offset = idx * 4;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
          );
          values.push(
            thread.id,
            m.role || 'user',
            m.content || '',
            m.createdAt ? new Date(m.createdAt) : new Date(),
          );
        });

        const insertMsgSql = `
          INSERT INTO chat_messages (thread_id, role, content, timestamp)
          VALUES ${placeholders.join(', ')};
        `;
        await client.query(insertMsgSql, values);
      }

      await client.query('COMMIT');
      return thread;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteByClientThreadId(
    userId: number,
    clientThreadId: string,
  ): Promise<void> {
    const sql = `
      DELETE FROM chat_threads
      WHERE user_id = $1 AND client_thread_id = $2;
    `;
    await this.pg.query(sql, [userId, clientThreadId]);
  }
}
