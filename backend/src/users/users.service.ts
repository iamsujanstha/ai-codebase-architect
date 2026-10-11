import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PostgresService } from '../database/postgres.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional() private readonly postgresService?: PostgresService,
  ) {}

  private mapPostgresUser(row: any): any {
    if (!row) return null;
    return {
      _id: row.id.toString(),
      id: row.id.toString(),
      email: row.email,
      password: row.password,
      name: row.name,
      role: row.role || 'user',
      googleId: row.google_id,
      avatar: row.avatar,
      resetToken: row.reset_token,
      resetTokenExpires: row.reset_token_expires,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      save: async () => row,
    };
  }

  async create(userData: Partial<User>): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const result = await this.postgresService.query(
          `INSERT INTO users (email, password, name, role, google_id, avatar, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
           RETURNING *`,
          [
            userData.email,
            userData.password,
            userData.name,
            userData.role || 'user',
            userData.googleId || null,
            userData.avatar || null,
          ],
        );
        if (result.rows.length > 0) {
          try {
            const newUser = new this.userModel(userData);
            await newUser.save();
          } catch {}
          return this.mapPostgresUser(result.rows[0]);
        }
      } catch {
        // Fallback to mongo
      }
    }
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async findByEmail(email: string): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const result = await this.postgresService.query(
          `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email],
        );
        if (result.rows.length > 0) {
          return this.mapPostgresUser(result.rows[0]);
        }
      } catch {
        // Fallback to mongo
      }
    }
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(id: string): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
          const result = await this.postgresService.query(
            `SELECT * FROM users WHERE id = $1 LIMIT 1`,
            [numericId],
          );
          if (result.rows.length > 0) {
            return this.mapPostgresUser(result.rows[0]);
          }
        }
      } catch {
        // Fallback
      }
    }
    return this.userModel.findById(id).exec();
  }

  async findByGoogleId(googleId: string): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const result = await this.postgresService.query(
          `SELECT * FROM users WHERE google_id = $1 LIMIT 1`,
          [googleId],
        );
        if (result.rows.length > 0) {
          return this.mapPostgresUser(result.rows[0]);
        }
      } catch {
        // Fallback
      }
    }
    return this.userModel.findOne({ googleId }).exec();
  }

  async update(id: string, updateData: Partial<User>): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
          const updates: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

          if (updateData.password !== undefined) {
            updates.push(`password = $${paramIdx++}`);
            values.push(updateData.password);
          }
          if (updateData.name !== undefined) {
            updates.push(`name = $${paramIdx++}`);
            values.push(updateData.name);
          }
          if (updateData.avatar !== undefined) {
            updates.push(`avatar = $${paramIdx++}`);
            values.push(updateData.avatar);
          }
          if (updateData.googleId !== undefined) {
            updates.push(`google_id = $${paramIdx++}`);
            values.push(updateData.googleId);
          }
          if (updateData.resetToken !== undefined) {
            updates.push(`reset_token = $${paramIdx++}`);
            values.push(updateData.resetToken);
          }
          if (updateData.resetTokenExpires !== undefined) {
            updates.push(`reset_token_expires = $${paramIdx++}`);
            values.push(updateData.resetTokenExpires);
          }

          if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            values.push(numericId);
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
            const result = await this.postgresService.query(query, values);
            if (result.rows.length > 0) {
              return this.mapPostgresUser(result.rows[0]);
            }
          }
        }
      } catch {
        // Fallback
      }
    }
    return this.userModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async findByResetToken(token: string): Promise<any> {
    if (this.postgresService?.isReady()) {
      try {
        const result = await this.postgresService.query(
          `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() LIMIT 1`,
          [token],
        );
        if (result.rows.length > 0) {
          return this.mapPostgresUser(result.rows[0]);
        }
      } catch {
        // Fallback
      }
    }
    return this.userModel.findOne({
      resetToken: token,
      resetTokenExpires: { $gt: new Date() },
    }).exec();
  }
}

