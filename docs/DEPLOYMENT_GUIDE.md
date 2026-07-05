# Run Bot — Full Deployment Guide

This guide explains how to deploy the whole **Run Bot** feature, step by step.

It is written in simple English. Each step says **what to do** and **why**.
If a word is technical, it is explained.

> **Read this first.** Run Bot has **five parts** that live in different places.
> They must be deployed in the right order, because each part depends on the
> one before it. This guide walks through that order.

---

## 1. What you are deploying (the big picture)

Run Bot lets a user control their MT5 trading robot (called an **EA**, Expert
Advisor) from the SafetyScore website. They can start it, stop it, close trades,
hit a kill switch, change settings, watch live data, and see a profit/loss
chart — without logging into the Windows server by remote desktop.

There are **two backends on purpose**:

- **License** stays on **Supabase** (low traffic, cheap).
- **Telemetry and commands** go to a **self-hosted server** called **run-bot-api**
  (high traffic, so we keep it off Supabase to avoid cost limits).

Here is how the parts talk to each other:

```
   ┌────────────────────────────────────────────────────────────────────┐
   │                         MT5 Windows VPS                             │
   │                                                                     │
   │   Sn1P3r EA  ──license check (Ed25519, HTTPS)──►  Supabase          │
   │     │           returns: license OK + bot token   (license-verify   │
   │     │                                               + bot-token)     │
   │     │ ZMQ (127.0.0.1 only)                                          │
   │     ▼                                                                │
   │   Go bridge ──Socket.IO (HTTPS)──►  Cloudflare Tunnel               │
   └──────────────────────────────────────────│─────────────────────────┘
                                               ▼
                              ┌────────────────────────────┐
                              │   Proxmox VM (your server) │
                              │   run-bot-api + MongoDB        │
                              │   (Docker Compose)          │
                              └──────────────│──────────────┘
                                             │ Socket.IO + REST (HTTPS)
                                             ▼
                              SafetyScore website
                              /dashboard/run-bot  (the user's browser)
```

**The five parts to deploy:**

| # | Part | Where it runs | Status today |
|---|------|---------------|--------------|
| A | **Signing keypair** | You generate it once | Ready (script exists) |
| B | **Supabase `bot-token` function** | Supabase cloud | Built ✅ |
| C | **SafetyScore web app** | Vercel (or your host) | Built ✅ |
| D | **run-bot-api + MongoDB** | Your Proxmox VM (Docker) | Built ✅ (live tunnel pending) |
| E | **Go bridge + MT5 EA/DLL** | Windows MT5 VPS | Needs Windows build |

> **Terms used in this guide**
> - **EA** = Expert Advisor = the trading robot program inside MT5.
> - **DLL** = a small Windows library the EA uses to talk to the license server.
> - **ZMQ** = a fast local messaging system the EA uses to talk to the Go bridge.
> - **Socket.IO** = a real-time web connection used between the bridge, run-bot-api,
>   and the browser.
> - **Token** = a short signed text (a JWT) that proves who you are. It expires
>   after about 60 minutes.
> - **ES256** = the signing method used for these tokens.
> - **Tunnel** = a safe way to put a server on the internet without opening ports.

---

## 2. Deployment order (very important)

Deploy in **this order**. Each part needs the one before it.

1. **Part A — Generate the signing keypair.** Everything else uses these keys.
2. **Part B — Deploy the Supabase `bot-token` function.** It needs the private key.
3. **Part C — Deploy the web app.** It also needs the private key and the run-bot-api URL.
4. **Part D — Deploy run-bot-api on Proxmox + the Cloudflare Tunnel.** It needs the
   public key and gives you the public HTTPS URL.
5. **Part E — Build and install the Go bridge + EA/DLL on the MT5 VPS.** They need
   the run-bot-api URL.

> Note: Parts C and D both need the same things from each other. Deploy run-bot-api
> (Part D) far enough to get its **public URL**, then put that URL into the web
> app (Part C). The order above already handles this.

---

## 3. Part A — Generate the signing keypair (one time)

### Why
SafetyScore signs every token with a **private key**. run-bot-api checks every
token with the matching **public key**. This is one keypair. The private key
must stay secret. The public key is safe to share.

There is one private key and one public key:

- **Private key** → goes into the **web app** and the **Supabase function**.
- **Public key** → goes into **run-bot-api** only.

### Steps

1. From the repo root, run the generator script with Deno:

   ```bash
   deno run --allow-all supabase/functions/_shared/__scripts__/gen-bot-token-key.ts
   ```

2. It prints **two keys**: a private key (PEM) and a public key (PEM).
   "PEM" is just a text format that starts with `-----BEGIN ...-----`.

3. **Save both keys in a safe place** (a password manager or a secrets vault).
   You will paste them into the next parts.

> ⚠️ **Security warning.** A development keypair was once printed into build
> logs, so it is treated as exposed. **Always generate a fresh keypair for
> production.** Never paste a real private key into chat, screenshots, or logs.
> Record the rotation date in `web/.env.production.rotated`.

---

## 4. Part B — Deploy the Supabase `bot-token` function

### Why
The EA asks for a license. If the license is valid, this function gives back a
signed **bot token**. The bridge uses that token to connect to run-bot-api.

This function reuses the same license logic as `license-verify`. The revenue
path does not change.

### Steps

1. Set the **private key** as a Supabase Edge Function secret:

   ```bash
   supabase secrets set SAFETYSCORE_TOKEN_PRIVATE_KEY="$(cat private-key.pem)" \
     --project-ref <your-project-ref>
   ```

   Replace `<your-project-ref>` with your Supabase project id.

2. Deploy the function:

   ```bash
   supabase functions deploy bot-token --project-ref <your-project-ref>
   ```

3. Confirm it is live in the Supabase dashboard under **Edge Functions**.

> **Before merging any change to license code**, run the `sdd-license-flow-audit`
> skill and the `license-verify` regression test. This protects the payment path.

---

## 5. Part C — Deploy the SafetyScore web app

### Why
The website shows the `/dashboard/run-bot` page. When a logged-in user opens it,
the **server** mints a short browser token (using the private key) so the
browser can connect to run-bot-api. The private key never reaches the browser.

### Environment variables to set

Set these in your hosting provider (for example, Vercel project settings):

| Variable | Value | Notes |
|---|---|---|
| `SAFETYSCORE_TOKEN_PRIVATE_KEY` | The ES256 **private** key (PEM) | **Server-only.** Never expose to the browser. |
| `NEXT_PUBLIC_BHUB_API_URL` | The run-bot-api public HTTPS URL | From Part D, e.g. `https://bhub.your-domain.com` |

> `NEXT_PUBLIC_` means the value is visible in the browser. That is fine — it is
> only a URL, not a secret. The private key has **no** `NEXT_PUBLIC_` prefix, so
> it stays on the server.

### Steps

1. Add the two variables above to your host.
2. Deploy the web app as usual (for example, push to the branch Vercel builds,
   or run `vercel deploy`).
3. Check `pnpm build` passes locally first if you deploy by hand:

   ```bash
   cd web
   pnpm install
   pnpm build
   ```

4. After deploy, log in and open `/dashboard/run-bot`. You should see the page
   load with an "offline / no instance" empty state. (It stays empty until the
   bridge and EA are live in Part E.)

---

## 6. Part D — Deploy run-bot-api on your Proxmox VM

This is the self-hosted backend. It runs with Docker. It stores telemetry,
audit logs, instances, and PnL history in MongoDB.

> run-bot-api already ships a full deploy guide at `run-bot-api/DEPLOY.md`. This
> section is a short version. Read `DEPLOY.md` for the complete detail.

### 6.1 What you need first

- A Proxmox VM (Linux) with **Docker** and **Docker Compose** installed.
- The **ES256 public key** from Part A.
- The SafetyScore web origin (for CORS), e.g. `https://app.safetyscore.com`.
  "CORS" is a browser rule that only lets the listed website talk to run-bot-api.

### 6.2 Set the environment file

In the `run-bot-api/` folder on the VM:

```bash
cp .env.docker.example .env
```

Open `.env` and set:

| Variable | What to put |
|---|---|
| `PORT` | Port the app listens on. Default `4000`. |
| `FRONTEND_URL` | The SafetyScore web origin (for CORS). |
| `SAFETYSCORE_TOKEN_PUBLIC_KEY` | The ES256 **public** key (PEM or base64 PEM, one line). |

> Only the **public** key goes here. The private key must never be on this server.
> The stack refuses to start if `FRONTEND_URL` or the public key is missing.

### 6.3 Start the stack

```bash
docker compose up -d --build
```

This builds the image, starts MongoDB, waits until it is healthy, then starts
run-bot-api. Both restart by themselves if the VM reboots.

Check both are healthy:

```bash
docker compose ps
```

Test the health endpoint from the VM itself (the port is bound to `127.0.0.1`):

```bash
curl http://127.0.0.1:4000/health
# {"status":"ok","uptime":...,"env":"production"}
```

### 6.4 Put it on the internet with a Cloudflare Tunnel

The VM has no public IP and no open ports. A **Cloudflare Tunnel** makes a safe
outbound link and serves run-bot-api at a stable HTTPS address. Both the Go bridge
and the browser use that address.

You need a Cloudflare account and a domain on Cloudflare.

**Simplest option — run `cloudflared` on the host:**

`~/.cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /root/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: bhub.your-domain.com
    service: http://127.0.0.1:4000
  - service: http_status:404
```

Run it:

```bash
cloudflared tunnel run <YOUR_TUNNEL_ID>
```

(There is also a container option in `run-bot-api/DEPLOY.md` if you prefer.)

### 6.5 After the tunnel is up

- Your run-bot-api public URL is now `https://bhub.your-domain.com`.
- **Go back to Part C** and set `NEXT_PUBLIC_BHUB_API_URL` to this URL, then
  redeploy the web app.
- Make sure `FRONTEND_URL` in run-bot-api matches the web origin exactly, or the
  browser calls fail with a CORS error.
- The tunnel is a **single point of failure** for telemetry and commands. Add
  simple up/down alerting on the hostname. (Trading itself is not affected — the
  license path is separate.)

### 6.6 Backups

Only settings, audit logs, instances, and PnL points are durable data. Back
them up on a schedule:

```bash
docker compose exec mongo mongodump --archive=/tmp/backup.gz --gzip
docker compose cp mongo:/tmp/backup.gz ./backup-$(date +%F).gz
```

---

## 7. Part E — Go bridge + MT5 EA/DLL (on the Windows MT5 VPS)

> **Status:** the code changes are done, but the final Windows builds (the EA,
> the DLL, and the bridge `.exe`) must be compiled on a Windows machine with
> MetaEditor and the C++/Go toolchains. Those builds are **not** done in this
> repo. This section explains how to deploy them once built.

### 7.1 The Go bridge

The bridge runs on the same Windows VPS as MT5. It carries messages between the
EA (over ZMQ on `127.0.0.1`) and run-bot-api (over Socket.IO/HTTPS).

1. Build the bridge for Windows (on a build machine):

   ```bash
   make build-windows
   ```

2. Copy the bridge `.exe` to the MT5 VPS.

3. Set the bridge config (its `bridge.env` / `config.go` values) so it points at
   your run-bot-api URL:

   ```
   BHUB_API_URL=https://bhub.your-domain.com
   ```

4. The bridge does **not** hold a token. The EA gives it the bot token over ZMQ.
   So start MT5 with the EA first (next step), then start the bridge.

5. Check the bridge connects:

   ```bash
   bridge.exe --status
   ```

   It should report a connection to run-bot-api.

### 7.2 The MT5 EA and DLL

1. Install the new `SafetyScore.dll` (it now surfaces the bot token to the EA)
   into the MT5 `Libraries` folder.

2. Install the new EA (`Sn1P3r Grid Hunter`) with the console panel folded in.
   Compile it in MetaEditor if needed.

3. In MT5, allow **WebRequest** to the Supabase license URL (Tools → Options →
   Expert Advisors → allowed URLs). The EA needs this to get its license and
   token.

4. Attach the EA to a chart. On a valid license it will:
   - Get the bot token from the DLL.
   - Send it to the bridge over ZMQ.
   - Start sending telemetry.

> **Safety rule:** if run-bot-api or the bridge is down, **trading must continue**.
> The transport is non-blocking by design. A cloud outage never stops trades.

---

## 8. End-to-end check (after all five parts are live)

Do these in order. Each one proves the link before it works.

1. **Supabase:** the EA gets a license **and** a non-empty bot token.
2. **Bridge:** `bridge.exe --status` shows a live connection to run-bot-api.
3. **run-bot-api:** `docker compose ps` shows both containers healthy; `/health`
   returns ok.
4. **Browser:** open `/dashboard/run-bot`, pick the instance. You should see:
   - Live telemetry updating within a few seconds.
   - The connection dots showing the bridge and MT5 online.
5. **Commands:** press **Stop** (master-enable off), then **Start**. Watch for
   the green ACK toast (the EA confirming the command).
6. **Kill switch:** type `KILL`, confirm, and watch the ACK arrive within 10s.
7. **PnL chart:** leave the bot online for a few minutes. The PnL chart fills in.
   Refresh the page — the chart **survives the refresh** (the history is stored
   in MongoDB, not just in the browser).

---

## 9. Security checklist (do not skip)

- [ ] The **private key** is only in the web app server env and the Supabase
      secret. It is **never** in run-bot-api, the browser bundle, logs, or chat.
- [ ] The **public key** is only in run-bot-api.
- [ ] You generated a **fresh** keypair for production (not the exposed dev one).
- [ ] `FRONTEND_URL` in run-bot-api matches the real web origin (CORS).
- [ ] ZMQ is bound to `127.0.0.1` only on the MT5 VPS (not the public internet).
- [ ] MongoDB is internal-only (never published to the host).
- [ ] The Cloudflare Tunnel has up/down alerting.
- [ ] A user cannot see or control another user's bot (owner check). Test with
      two accounts.
- [ ] Rotation date written in `web/.env.production.rotated`.

---

## 10. Quick reference — environment variables

| Variable | Lives in | Value | Secret? |
|---|---|---|---|
| `SAFETYSCORE_TOKEN_PRIVATE_KEY` | Web app (server) + Supabase secret | ES256 private PEM | **Yes** |
| `SAFETYSCORE_TOKEN_PUBLIC_KEY` | run-bot-api `.env` | ES256 public PEM | No |
| `NEXT_PUBLIC_BHUB_API_URL` | Web app | `https://bhub.your-domain.com` | No |
| `FRONTEND_URL` | run-bot-api `.env` | The web origin (CORS) | No |
| `PORT` | run-bot-api `.env` | `4000` | No |
| `BHUB_API_URL` | Go bridge config | `https://bhub.your-domain.com` | No |

---

## 11. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Browser shows CORS error | `FRONTEND_URL` does not match the web origin | Set it to the exact origin, restart run-bot-api. |
| Browser cannot connect at all | `NEXT_PUBLIC_BHUB_API_URL` wrong, or tunnel down | Check the URL and `cloudflared` status. |
| run-bot-api will not start | Missing public key or `FRONTEND_URL` | Fill both in `.env`. The app fails fast on purpose. |
| Token rejected by run-bot-api | Public/private keys do not match | They must be one pair. Regenerate and redeploy both halves. |
| Telemetry never appears | Bridge or EA not running, or token not sent | Start MT5 + EA first, then the bridge. Check `--status`. |
| EA gets no token | License invalid, or `bot-token` not deployed | Check the license and that the function is live. |
| Page empty but bot is trading | Cloud path down — this is safe | Trading continues. Fix the tunnel/bridge; trades are fine. |
| PnL chart empty | Bot just started, or it was offline | Points are recorded once a minute while online. Wait. |

---

## 12. What is built vs. what still needs your hardware

| Part | Built and tested here | Still needs your action |
|---|---|---|
| A — Keypair script | ✅ Yes | Generate a production pair |
| B — `bot-token` function | ✅ Yes | Deploy + set the secret |
| C — Web app (run-bot UI, token mint, PnL chart) | ✅ Yes | Set env vars + deploy |
| D — run-bot-api Docker stack | ✅ Builds + boots locally | Run on Proxmox + live Cloudflare Tunnel |
| E — Go bridge code | ✅ Code done | Build `.exe`, install on VPS |
| E — MT5 EA + DLL | ⏳ Code planned | Build in MetaEditor / C++ on Windows |

The remaining work in Part D (live tunnel) and Part E (Windows builds + a live
VPS) needs your Cloudflare account and a Windows machine. Everything that can be
built and tested in this repo is done and green.

---

## 13. Where to read more

- `docs/run-bot/ImplementPlan.md` — the full plan, every task, and status.
- `docs/run-bot/contracts.md` — the exact token claims, Socket.IO events, HTTP
  endpoints, and telemetry shape.
- `run-bot-api/DEPLOY.md` — the long version of Part D (Docker + tunnel).
