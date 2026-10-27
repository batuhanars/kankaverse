import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { channelNameError, graphemeLength, isSingleEmoji } from './channel-name.util';

/** C21: kanal adı (Transform ile normalleştirilmiş değeri) kural + emoji için doğrular. */
export function IsChannelName(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isChannelName',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (v: unknown) => typeof v === 'string' && channelNameError(v) === null,
        defaultMessage: (a?: ValidationArguments) =>
          (typeof a?.value === 'string' && channelNameError(a.value)) || 'Geçersiz kanal adı.',
      },
    });
}

/** C21: uzunluk görünen karakter (grapheme) sayısına göre. */
export function GraphemeLength(min: number, max: number, label: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'graphemeLength',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (v: unknown) => {
          if (typeof v !== 'string') return false;
          const n = graphemeLength(v);
          return n >= min && n <= max;
        },
        defaultMessage: (a?: ValidationArguments) =>
          typeof a?.value === 'string' && graphemeLength(a.value) < min
            ? `${label} en az ${min} karakter olmalıdır.`
            : `${label} en fazla ${max} karakter olabilir.`,
      },
    });
}

/** C21: tek emoji (ZWJ/ten rengi/bayrak dahil). Boş/undefined/null `@IsOptional` ile elenir. */
export function IsSingleEmoji(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isSingleEmoji',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (v: unknown) => typeof v === 'string' && isSingleEmoji(v),
        defaultMessage: () => 'Rol simgesi tek bir emoji olmalıdır.',
      },
    });
}
