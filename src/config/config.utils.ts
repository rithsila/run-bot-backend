export function parseCorsOrigins(originsCsv: string): string[] {
  return originsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
