import { IsOptional, IsString } from 'class-validator';

export class PdfChatRequestDto {
  @IsOptional()
  @IsString()
  documentId?: string;
}
