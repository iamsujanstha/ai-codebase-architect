import axios from 'axios';
import { PassThrough } from 'stream';
import { Response } from 'express';
import { AiGatewayService } from './ai.service';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('AI gateway provider boundary', () => {
  beforeEach(() => jest.resetAllMocks());

  it('passes the configured provider and maps model metadata', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        provider: 'mock',
        default_model: 'mock-model',
        models: [
          {
            name: 'mock-model',
            size_bytes: 0,
            size_label: 'Development fixture',
            modified_at: '',
          },
        ],
      },
    });
    const result = await new AiGatewayService().listModels();
    expect(result.provider).toBe('mock');
    expect(result.models[0].sizeLabel).toBe('Development fixture');
  });

  it('aborts and destroys the upstream stream when the browser disconnects', async () => {
    const upstream = new PassThrough();
    mockedAxios.post.mockResolvedValue({ data: upstream });
    const output = new PassThrough();
    const response = Object.assign(output, {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
    }) as unknown as Response;
    await new AiGatewayService().streamResponse(
      'hello',
      [],
      'mock-model',
      response,
    );
    const config = mockedAxios.post.mock.calls[0][2];
    expect(config?.signal?.aborted).toBe(false);
    output.destroy();
    await new Promise<void>((resolve) => output.once('close', resolve));
    expect(config?.signal?.aborted).toBe(true);
    expect(upstream.destroyed).toBe(true);
  });
});
