import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PdfChatRequestDto } from './dto/pdf-chat-request.dto';
import { PdfRagService } from './pdf-rag.service';

@Controller('pdf-rag')
export class PdfRagController {
  constructor(private readonly pdfRagService: PdfRagService) {}

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async uploadDocument(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Upload a PDF file before chatting.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF uploads are supported.');
    }

    return this.pdfRagService.indexPdf(file);
  }

  @Post('chat')
  async chat(
    @Body() request: PdfChatRequestDto & Record<string, unknown>,
    @Res() response: Response,
  ) {
    await this.pdfRagService.streamChat(request, response);
  }

  @Get('costs')
  getCostEvents() {
    return this.pdfRagService.getCostEvents();
  }

  @Get('health')
  getHealth() {
    return this.pdfRagService.getHealth();
  }
}
