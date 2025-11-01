// src/common/types/auth-request.type.ts
import { Request } from 'express';
import { Role } from 'src/user/user.enum';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role?: Role;
  };
}
