import { Inject, Injectable } from '@nestjs/common';
import {
  IUsersRepository,
  USERS_REPOSITORY_TOKEN,
  UserRecord,
} from './repositories/users.repository.interface';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  CUSTOMER = 'customer',
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY_TOKEN)
    private readonly usersRepo: IUsersRepository,
  ) {}

  private mapUser(row: UserRecord | null): any {
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
      status: row.status || (row.is_active ? 'active' : 'suspended'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      save: async () => row,
    };
  }

  async create(userData: any): Promise<any> {
    const row = await this.usersRepo.create({
      email: userData.email,
      password: userData.password,
      name: userData.name,
      role: userData.role || 'user',
      googleId: userData.googleId || null,
      avatar: userData.avatar || null,
      isActive: userData.isActive ?? true,
      status: userData.status || 'active',
    });
    return this.mapUser(row);
  }

  async findByEmail(email: string): Promise<any> {
    const row = await this.usersRepo.findByEmail(email);
    return this.mapUser(row);
  }

  async findById(id: string | number): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const row = await this.usersRepo.findById(numId);
    return this.mapUser(row);
  }

  async findByGoogleId(googleId: string): Promise<any> {
    const row = await this.usersRepo.findByGoogleId(googleId);
    return this.mapUser(row);
  }

  async findByResetToken(token: string): Promise<any> {
    const row = await this.usersRepo.findByResetToken(token);
    return this.mapUser(row);
  }

  async update(id: string | number, updateData: any): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const row = await this.usersRepo.update(numId, updateData);
    return this.mapUser(row);
  }

  async delete(id: string | number): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return { success: false };
    await this.usersRepo.delete(numId);
    return { success: true };
  }
}
