export function subnet24(ip: string): string {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}
