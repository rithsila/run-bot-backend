// src/auth/dto/signup.dto.ts
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SignupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    return v.length ? v : undefined; // empty → undefined
  })
  lastName?: string;

  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must include upper, lower, and number',
  })
  password!: string;

  // Accept-but-ignore if some layer injects them
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.slice(0, 200) : value))
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.slice(0, 200) : value))
  referer?: string;

  /** Optional: include if your frontend POSTs JSON with the Turnstile token.
   *  If you submit a <form> with <div class="cf-turnstile">, the guard reads
   *  'cf-turnstile-response' automatically and this field can be omitted. */
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
