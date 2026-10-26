export interface UserRecord {
  id: number;
  email: string;
  password?: string | null;
  name?: string | null;
  role: string;
  google_id?: string | null;
  avatar?: string | null;
  reset_token?: string | null;
  reset_token_expires?: Date | null;
  is_active: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password?: string;
  name?: string;
  role?: string;
  googleId?: string | null;
  avatar?: string | null;
  isActive?: boolean;
  status?: string;
}

export interface UpdateUserData {
  name?: string;
  password?: string;
  role?: string;
  googleId?: string | null;
  avatar?: string | null;
  resetToken?: string | null;
  resetTokenExpires?: Date | null;
  isActive?: boolean;
  status?: string;
}

export interface IUsersRepository {
  create(data: CreateUserData): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: number): Promise<UserRecord | null>;
  findByGoogleId(googleId: string): Promise<UserRecord | null>;
  findByResetToken(token: string): Promise<UserRecord | null>;
  update(id: number, data: UpdateUserData): Promise<UserRecord>;
  delete(id: number): Promise<void>;
  count(): Promise<number>;
}

export const USERS_REPOSITORY_TOKEN = Symbol('IUsersRepository');
