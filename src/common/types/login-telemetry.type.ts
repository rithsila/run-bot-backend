export type LoginTelemetry = {
    ip?: string | null;
    userAgent?: string | null;
    deviceId?: string | null; // raw from header
    deviceIdHash?: string | null; // hashed if you prefer
};
