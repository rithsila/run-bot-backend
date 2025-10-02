// src/user/dto/user-public.dto.ts
export type UserPublicDto = {
  id: string;                  // stringified _id
  email: string;               // normalized email
  firstName: string;
  lastName?: string | null;
  displayName: string;         // convenience for UI
  photoURL?: string | null;
  role: string;                // single role (you can change to string[])
  emailVerified: boolean;
  createdAt: string;           // ISO
  updatedAt: string;           // ISO
};
