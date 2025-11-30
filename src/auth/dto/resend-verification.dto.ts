// src/auth/dto/resend-verification.dto.ts
import { EmailField } from 'src/common/validators/email-field.decorator';
export class ResendVerificationDto {
    @EmailField()
    email: string;
}
