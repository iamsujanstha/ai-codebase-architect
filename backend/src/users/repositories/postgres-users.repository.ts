import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  CreateUserData,
  IUsersRepository,
  UpdateUserData,
  UserRecord,
} from './users.repository.interface';

@Injectable()
export class PostgresUsersRepository implements IUsersRepository {
  constructor(private readonly pg: PostgresService) {}

  async create(data: CreateUserData): Promise<UserRecord> {
    const sql = `
      INSERT INTO users (email, password, name, role, google_id, avatar, is_active, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at;
    `;
    const res = await this.pg.query<UserRecord>(sql, [
      data.email.toLowerCase(),
      data.password || '',
      data.name || '',
      data.role || 'user',
      data.googleId ?? null,
      data.avatar ?? null,
      data.isActive ?? true,
      data.status || 'active',
    ]);
    return res.rows[0];
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const sql = `
      SELECT id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const res = await this.pg.query<UserRecord>(sql, [email.trim()]);
    return res.rows[0] ?? null;
  }

  async findById(id: number): Promise<UserRecord | null> {
    const sql = `
      SELECT id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await this.pg.query<UserRecord>(sql, [id]);
    return res.rows[0] ?? null;
  }

  async findByGoogleId(googleId: string): Promise<UserRecord | null> {
    const sql = `
      SELECT id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at
      FROM users
      WHERE google_id = $1
      LIMIT 1;
    `;
    const res = await this.pg.query<UserRecord>(sql, [googleId]);
    return res.rows[0] ?? null;
  }

  async findByResetToken(token: string): Promise<UserRecord | null> {
    const sql = `
      SELECT id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at
      FROM users
      WHERE reset_token = $1 AND reset_token_expires > NOW()
      LIMIT 1;
    `;
    const res = await this.pg.query<UserRecord>(sql, [token]);
    return res.rows[0] ?? null;
  }

  async update(id: number, updateData: UpdateUserData): Promise<UserRecord> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    if (updateData.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updateData.name);
    }
    if (updateData.password !== undefined) {
      setClauses.push(`password = $${idx++}`);
      values.push(updateData.password);
    }
    if (updateData.role !== undefined) {
      setClauses.push(`role = $${idx++}`);
      values.push(updateData.role);
    }
    if (updateData.googleId !== undefined) {
      setClauses.push(`google_id = $${idx++}`);
      values.push(updateData.googleId);
    }
    if (updateData.avatar !== undefined) {
      setClauses.push(`avatar = $${idx++}`);
      values.push(updateData.avatar);
    }
    if (updateData.resetToken !== undefined) {
      setClauses.push(`reset_token = $${idx++}`);
      values.push(updateData.resetToken);
    }
    if (updateData.resetTokenExpires !== undefined) {
      setClauses.push(`reset_token_expires = $${idx++}`);
      values.push(updateData.resetTokenExpires);
    }
    if (updateData.isActive !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      values.push(updateData.isActive);
    }
    if (updateData.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(updateData.status);
    }

    values.push(id);
    const sql = `
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING id, email, password, name, role, google_id, avatar, reset_token, reset_token_expires, is_active, status, created_at, updated_at;
    `;
    const res = await this.pg.query<UserRecord>(sql, values);
    return res.rows[0];
  }

  async delete(id: number): Promise<void> {
    const sql = `DELETE FROM users WHERE id = $1;`;
    await this.pg.query(sql, [id]);
  }

  async count(): Promise<number> {
    const sql = `SELECT COUNT(*)::int AS count FROM users;`;
    const res = await this.pg.query<{ count: number }>(sql);
    return Number(res.rows[0]?.count || 0);
  }
}
