import { IsString, IsEmail, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { UserRole } from '../../users/schemas/user.schema';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  avatar?: string;
}
