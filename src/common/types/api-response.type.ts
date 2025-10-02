export interface ApiSuccess<T = undefined> {
  success: true;
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path: string;
  data?: T;
}

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};