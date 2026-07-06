# DNS and Domain Setup (Cloudflare Tunnel)

This guide explains how the domain `easafetyscore.com` is set up, and how to fix connection problems between the frontend and the backend API.

Last verified: 2026-07-05.

## The Big Picture

```
Browser (user)
   │
   ├── https://www.easafetyscore.com          → Vercel (Next.js frontend)
   │
   └── https://run-bot-api.easafetyscore.com  → Cloudflare Tunnel → VM localhost:4000 (this backend)
```

- The **domain** is registered at **GoDaddy**. We still pay GoDaddy for the domain name.
- The **DNS** (the address book of the domain) is hosted at **Cloudflare**. The nameservers are `rocky.ns.cloudflare.com` and `virginia.ns.cloudflare.com`.
- The backend runs in Docker on a Proxmox VM. It is **not** open to the internet directly. A **Cloudflare Tunnel** (`cloudflared`) connects out from the VM to Cloudflare. Visitors reach the API through Cloudflare only.

## Why DNS Must Be on Cloudflare

This is the most important rule of this setup.

The tunnel gets a special address that ends with `.cfargotunnel.com`. This address **only works inside Cloudflare**. If you create a CNAME record to it at another DNS provider (like GoDaddy), the name will **never resolve**. Browsers will show `ERR_NAME_NOT_RESOLVED`.

So the DNS zone must live in Cloudflare, and the tunnel record must have the **orange cloud (Proxied) turned ON**.

## Current DNS Records

| Type | Name | Points to | Proxy |
|---|---|---|---|
| A | `easafetyscore.com` | Vercel (`216.198.79.1`) | Proxied |
| CNAME | `www` | Vercel | Proxied |
| CNAME | `run-bot-api` | `<tunnel-id>.cfargotunnel.com` | Proxied (**must stay ON**) |
| MX / TXT | `send`, `_dmarc`, `resend._domainkey` | Resend (email sending) | DNS only |

Notes:

- The tunnel ID is shown in Cloudflare under **Zero Trust → Networks → Tunnels**.
- The apex domain redirects to `www`. So the real address users see is `https://www.easafetyscore.com`.
- The Vercel records work with the proxy ON. If the frontend ever has strange cache or redirect problems, try switching those two records to "DNS only" first.

## CORS: One Rule to Remember

The backend only accepts browser requests from **one** origin: the value of the `FRONTEND_URL` environment variable on the VM.

It must be **exactly**:

```
FRONTEND_URL=https://www.easafetyscore.com
```

The `www` part matters. `https://easafetyscore.com` and `https://www.easafetyscore.com` are different origins for the browser.

After changing it, restart the container:

```bash
cd ~/run-bot-backend
docker compose up -d --build
```

Then check the log to confirm:

```bash
docker compose logs | grep "CORS"
# Expected: [CORS] allowed origins: https://www.easafetyscore.com
```

## Troubleshooting: Check Layer by Layer

When the dashboard cannot connect, test each layer in this order. Stop at the first one that fails — that is where the problem is.

### 1. DNS — does the name resolve?

```bash
dig +short run-bot-api.easafetyscore.com A
```

- **Expected:** two Cloudflare IPs (they start with `104.` or `172.`).
- **Empty answer:** the DNS record is missing, or the proxy (orange cloud) is OFF. Check the record in the Cloudflare dashboard.
- **`dig` works but the browser still says `ERR_NAME_NOT_RESOLVED`:** your computer cached an old answer. On macOS run:
  ```bash
  sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
  ```
  Then fully quit and reopen the browser.

### 2. Tunnel — does the API answer?

```bash
curl https://run-bot-api.easafetyscore.com/health
```

- **Expected:** `{"status":"ok", ...}` with status 200.
- **Error 530 or 502:** the tunnel or the container is down. On the VM check:
  ```bash
  systemctl status cloudflared     # tunnel service
  docker compose ps                # backend container
  ```
  Also check the tunnel status in Cloudflare: **Zero Trust → Networks → Tunnels** (it should say "Healthy").

### 3. CORS — does the backend accept the frontend?

```bash
curl -s -o /dev/null -X OPTIONS \
  https://run-bot-api.easafetyscore.com/console/instances \
  -H "Origin: https://www.easafetyscore.com" \
  -H "Access-Control-Request-Method: GET" \
  -D - | grep -i access-control-allow-origin
```

- **Expected:** `access-control-allow-origin: https://www.easafetyscore.com`
- **No output:** the origin is blocked. Fix `FRONTEND_URL` on the VM (see the CORS section above).

### 4. WebSocket — does live telemetry work?

```bash
curl "https://run-bot-api.easafetyscore.com/socket.io/?EIO=4&transport=polling"
```

- **Expected:** a response starting with `0{"sid":...` and containing `"upgrades":["websocket"]`.

## History

- **2026-07-05:** Moved DNS from GoDaddy to Cloudflare. Reason: the tunnel CNAME did not resolve at GoDaddy (see "Why DNS Must Be on Cloudflare" above). Also fixed `FRONTEND_URL` to include `www`.
