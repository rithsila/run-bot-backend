export function parseRedisUrl(url: string) {
  const u = new URL(url);
  const username = u.username || undefined;
  const password = u.password || undefined;
  const host = u.hostname;
  const port = Number(u.port || 6379);
  const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : undefined;
  return { host, port, username, password, db };
}
