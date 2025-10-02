export type CreateContext = {
  idempotencyKey: string;  // ⬅️ required by OrdersService
  requestId?: string;
  deviceId?: string;
  ip?: string;
  userAgent?: string;
};
