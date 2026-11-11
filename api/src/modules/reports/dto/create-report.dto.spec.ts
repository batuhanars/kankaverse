import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReportDto } from './create-report.dto';
import { CreateMessageDto } from '../../messages/dto/create-message.dto';
import { UpdateMessageDto } from '../../messages/dto/update-message.dto';

const ev = (i: number) => ({ messageId: `m${i}`, body: 'x', sentAt: 1 });
const base = { targetType: 'MESSAGE', targetId: 'm0', reason: 'SPAM' };

describe('CreateReportDto.evidence (E4)', () => {
  it('6 öğe geçer, 7 öğe 400 (doğrulama hatası)', async () => {
    const six = plainToInstance(CreateReportDto, { ...base, evidence: [0, 1, 2, 3, 4, 5].map(ev) });
    expect(await validate(six)).toHaveLength(0);
    const seven = plainToInstance(CreateReportDto, {
      ...base,
      evidence: [0, 1, 2, 3, 4, 5, 6].map(ev),
    });
    expect(await validate(seven)).not.toHaveLength(0);
  });

  it('öğe şekli doğrulanır (sentAt tam sayı, fk base64)', async () => {
    const bad = plainToInstance(CreateReportDto, {
      ...base,
      evidence: [{ messageId: 'm', body: 'x', sentAt: 1.5, fk: '***' }],
    });
    expect(await validate(bad)).not.toHaveLength(0);
  });
});

describe('frankingTag DTO kuralı (E4 §3.2): tam 32 bayt base64', () => {
  const ok = Buffer.alloc(32, 7).toString('base64');
  const make = (cls: new () => object, tag: unknown) =>
    validate(plainToInstance(cls, { ciphertext: 'AAAA', frankingTag: tag }));

  it.each([CreateMessageDto, UpdateMessageDto])(
    '%p: 32 bayt geçer; 31/33 bayt ve çöp reddedilir',
    async (cls) => {
      expect(await make(cls, ok)).toHaveLength(0);
      expect(await make(cls, Buffer.alloc(31, 7).toString('base64'))).not.toHaveLength(0);
      expect(await make(cls, Buffer.alloc(33, 7).toString('base64'))).not.toHaveLength(0);
      expect(await make(cls, '!!!')).not.toHaveLength(0);
      expect(await make(cls, 42)).not.toHaveLength(0);
    },
  );
});
