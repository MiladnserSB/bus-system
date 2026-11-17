import { Role } from '../../generated/prisma/enums.js';

export interface AuthUser {
  id: number;
  name: string;
  username: string | null;
  email: string | null;
  phone: string;
  role: Role;
  mustChangePassword: boolean;
  tokenVersion: number;
}
