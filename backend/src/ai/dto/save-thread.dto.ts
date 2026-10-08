import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveMessageDto {
  @IsString() id!: string;
  @IsString() role!: string;
  @IsString() content!: string;
  @IsString() status!: string;
  @IsString() createdAt!: string;
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() model?: string;
}

export class SaveThreadDto {
  @IsString() id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveMessageDto)
  messages!: SaveMessageDto[];

  @IsString() lastMessageAt!: string;

  @IsOptional()
  @IsString()
  model?: string;
}
