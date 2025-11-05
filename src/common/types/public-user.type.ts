
export type PublicUser = {
  _id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: string;
  photoURL?: string;
  emailVerified: boolean;
};
