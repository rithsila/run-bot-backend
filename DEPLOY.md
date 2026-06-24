# Deploying bhub-api (Run Bot backend)

This guide explains how to run bhub-api on your own server (Proxmox VM) with
Docker, and how to put it on the internet safely with a **Cloudflare Tunnel**.

bhub-api is the slimmed Run Bot backend. It handles **telemetry and commands**
for the MT5 bot. It does **not** check licenses and does **not** store user
accounts. It only trusts short-lived tokens that SafetyScore signs.

The stack has just two parts:

- **bhub-api** — the Node.js (NestJS) app.
- **mongo** — the only database. There is **no Redis** and **no BullMQ**.

---

## 1. What you need first

- Docker and Docker Compose installed on the VM.
- The **ES256 public key** from SafetyScore. SafetyScore keeps the matching
  private key and signs tokens with it. You only put the **public** half here.
- The web domain where SafetyScore runs (for example
  `https://app.safetyscore.com`). This is the CORS allowlist.

---

## 2. Set the environment values

Copy the example file and fill it in:

```bash
cp .env.docker.example .env
```

Open `.env` and set:

| Variable | What to put |
|---|---|
| `PORT` | The port the app listens on. Default `4000`. |
| `FRONTEND_URL` | The SafetyScore web origin (used for CORS). |
| `SAFETYSCORE_TOKEN_PUBLIC_KEY` | The ES256 **public** key. Raw PEM or base64 PEM, on one line. |

Compose reads this `.env` file automatically. Both `FRONTEND_URL` and
`SAFETYSCORE_TOKEN_PUBLIC_KEY` are required — the stack refuses to start if
either is missing.

> The `.env` file holds the public key only. Never put the private signing key
> on this server.

---

## 3. Start the stack

```bash
docker compose up -d --build
```

This builds the image, starts Mongo, waits until Mongo is healthy, then starts
bhub-api. Both services restart on their own if the VM reboots
(`restart: unless-stopped`).

Check the state:

```bash
docker compose ps
```

You should see both containers as `healthy`.

### Health check

The app exposes `GET /health`. The published port is bound to `127.0.0.1`
only, so test it from the VM itself:

```bash
curl http://127.0.0.1:4000/health
# {"status":"ok","uptime":...,"env":"production"}
```

Both the container and Compose run this same check on a 30-second interval.

### Data and storage

- Mongo data lives in the named volume `mongo-data`. It survives restarts and
  `docker compose down` (without `-v`).
- Mongo is **internal only** — it is never published to the host. Only bhub-api
  can reach it over the private Compose network.
- Back up the durable data with a periodic `mongodump` (settings, audit logs,
  and instances are the only durable data).

To stop the stack:

```bash
docker compose down        # keeps the Mongo volume
docker compose down -v     # also deletes the Mongo volume (data loss)
```

---

## 4. Put it on the internet with a Cloudflare Tunnel

The VM has no public IP and no port-forwarding. A **Cloudflare Tunnel**
(`cloudflared`) makes an outbound connection to Cloudflare and serves bhub-api
at a stable HTTPS hostname. Both the Go bridge (on the MT5 VPS) and the browser
use that hostname.

> **Scope note:** wiring the actual tunnel (Cloudflare account, named tunnel,
> DNS record) is done separately. This section shows where `cloudflared` should
> point once it exists.

You can run `cloudflared` in two ways. Pick one.

### Option A — `cloudflared` on the host (simplest)

The published port `127.0.0.1:${PORT}` exists for this case. Point the tunnel
at that loopback address.

`~/.cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /root/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: bhub.your-domain.com
    service: http://127.0.0.1:4000
  - service: http_status:404
```

Then run the tunnel:

```bash
cloudflared tunnel run <YOUR_TUNNEL_ID>
```

### Option B — `cloudflared` as a container on the same network

Add `cloudflared` to the Compose network and point it at the service name
`bhub-api` instead of the host port. With this option you can delete the
`ports:` block from `docker-compose.yml` (the API never needs to be on the
host).

Add a service like this to `docker-compose.yml`:

```yaml
    cloudflared:
        image: cloudflare/cloudflared:latest
        restart: unless-stopped
        command: tunnel run
        environment:
            TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
        depends_on:
            bhub-api:
                condition: service_healthy
```

In the Cloudflare dashboard, set the tunnel's public hostname to forward to:

```
http://bhub-api:4000
```

`bhub-api` is the Compose service name, so `cloudflared` reaches it directly
over the internal network. Put `CLOUDFLARE_TUNNEL_TOKEN` in your `.env`.

### After the tunnel is up

- Set SafetyScore's bhub-api URL to `https://bhub.your-domain.com`.
- Make sure `FRONTEND_URL` here matches the SafetyScore web origin, or the
  browser's WebSocket/HTTP calls fail CORS.
- The tunnel is a single point of failure for both the bridge lane and the
  browser lane. Add basic up/down alerting on the hostname. (Trading itself is
  unaffected — the license path is separate from this backend.)
