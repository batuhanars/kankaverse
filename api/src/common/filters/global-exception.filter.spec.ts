import { HttpException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function run(exception: unknown, url: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ url }),
    }),
  };
  new GlobalExceptionFilter().catch(exception, host as never);
  return { body: json.mock.calls[0][0] as Record<string, unknown>, status, setHeader };
}

describe('GlobalExceptionFilter (C35)', () => {
  it('§2.3: webhook yürütme adresindeki token hata gövdesinde maskelenir', () => {
    const { body } = run(
      new NotFoundException({ message: 'x', error: 'WEBHOOK_NOT_FOUND' }),
      '/webhooks/wh1/SECRETTOKEN',
    );
    expect(body.path).toBe('/webhooks/wh1/***');
    expect(JSON.stringify(body)).not.toContain('SECRETTOKEN');
  });

  it('diğer yollar değişmez', () => {
    const { body } = run(new NotFoundException(), '/auth/login');
    expect(body.path).toBe('/auth/login');
  });

  it('WEBHOOK_RATE_LIMITED için Retry-After başlığı eklenir', () => {
    const { setHeader, status } = run(
      new HttpException({ message: 'm', error: 'WEBHOOK_RATE_LIMITED', retryAfter: 3 }, 429),
      '/webhooks/a/b',
    );
    expect(status).toHaveBeenCalledWith(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3');
  });

  it('WEBHOOK_RATE_LIMITED gövdesi retry_after (Discord) ve retryAfter taşır, envelope bozulmaz', () => {
    const { body } = run(
      new HttpException({ message: 'm', error: 'WEBHOOK_RATE_LIMITED', retryAfter: 3 }, 429),
      '/webhooks/a/b',
    );
    expect(body).toMatchObject({
      success: false,
      statusCode: 429,
      error: 'WEBHOOK_RATE_LIMITED',
      retry_after: 3,
      retryAfter: 3,
    });
  });

  it('SLOW_MODE gibi diğer 429 yanıtlarında başlık eklenmez', () => {
    const { setHeader } = run(
      new HttpException({ message: 'm', error: 'SLOW_MODE', retryAfter: 3 }, 429),
      '/channels/c/messages',
    );
    expect(setHeader).not.toHaveBeenCalled();
  });
});
