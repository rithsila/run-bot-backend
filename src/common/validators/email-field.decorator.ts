import { applyDecorators } from '@nestjs/common';
import {
  IsEmail,
  IsNotEmpty,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

interface EmailFieldOptions {
  required?: boolean;
}

export function EmailField(options: EmailFieldOptions = {}) {
  const required = options.required ?? true;

  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    required
      ? IsNotEmpty({ message: 'EMAIL_REQUIRED' })
      : ValidateIf((_, value) => value !== null && value !== undefined && value !== ''),
    IsEmail({}, { message: 'EMAIL_INVALID' }),
    MaxLength(254, { message: 'EMAIL_TOO_LONG' }),
  );
}
