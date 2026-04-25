import { Controller, Post, Body } from '@nestjs/common';
import axios from 'axios';

@Controller('ai')
export class AiController {
  @Post('generate')
  async generate(@Body() body: { text: string }) {
    const res = await axios.post('http://ai-service:8000/generate', {
      text: body.text,
    });

    return res.data;
  }
}