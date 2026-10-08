import { Module } from '@nestjs/common';
import { PdfRagController } from './pdf-rag.controller';
import { PdfRagService } from './pdf-rag.service';

@Module({
  controllers: [PdfRagController],
  providers: [PdfRagService],
})
export class PdfRagModule {}
