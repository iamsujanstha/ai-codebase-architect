import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  role!: string;

  @IsString()
  content!: string;
}

// DTOs are more than just TypeScript types in NestJS.
// They are executable API contracts when combined with ValidationPipe.
//
// Why that matters in production:
// - invalid input is rejected early
// - controllers stay simpler
// - backend behavior becomes more predictable
export class GenerateAiRequestDto {
  @IsString()
  @MinLength(3, {
    message: 'Prompt must contain at least 3 characters.',
  })
  @MaxLength(4000, {
    message: 'Prompt must be 4000 characters or fewer.',
  })
  prompt!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages?: ChatMessageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200, {
    message: 'Model name must be 200 characters or fewer.',
  })
  model?: string;
}
