import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  CUSTOMER = 'customer',
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapUser(row: any): any {
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
    const row = await this.prisma.users.create({
      data: {
        email: userData.email,
        password: userData.password,
        name: userData.name,
        role: userData.role || 'user',
        google_id: userData.googleId || null,
        avatar: userData.avatar || null,
        is_active: userData.isActive ?? true,
        status: userData.status || 'active',
      },
    });
    return this.mapUser(row);
  }

  async findByEmail(email: string): Promise<any> {
    const row = await this.prisma.users.findUnique({
      where: { email },
    });
    return this.mapUser(row);
  }

  async findById(id: string | number): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const row = await this.prisma.users.findUnique({
      where: { id: numId },
    });
    return this.mapUser(row);
  }

  async findByGoogleId(googleId: string): Promise<any> {
    const row = await this.prisma.users.findUnique({
      where: { google_id: googleId },
    });
    return this.mapUser(row);
  }

  async findByResetToken(token: string): Promise<any> {
    const row = await this.prisma.users.findFirst({
      where: {
        reset_token: token,
        reset_token_expires: { gt: new Date() },
      },
    });
    return this.mapUser(row);
  }

  async update(id: string | number, updateData: any): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const data: any = {};
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.password !== undefined) data.password = updateData.password;
    if (updateData.role !== undefined) data.role = updateData.role;
    if (updateData.googleId !== undefined) data.google_id = updateData.googleId;
    if (updateData.avatar !== undefined) data.avatar = updateData.avatar;
    if (updateData.resetToken !== undefined)
      data.reset_token = updateData.resetToken;
    if (updateData.resetTokenExpires !== undefined)
      data.reset_token_expires = updateData.resetTokenExpires;
    if (updateData.isActive !== undefined) data.is_active = updateData.isActive;
    if (updateData.status !== undefined) data.status = updateData.status;

    const row = await this.prisma.users.update({
      where: { id: numId },
      data,
    });
    return this.mapUser(row);
  }

  async delete(id: string | number): Promise<any> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    await this.prisma.users.delete({
      where: { id: numId },
    });
    return { success: true };
  }
}
