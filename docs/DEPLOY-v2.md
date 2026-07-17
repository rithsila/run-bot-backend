# Deploy v2 — Backend Hardening

**Status:** Ready to deploy on Proxmox VM.

This release has NO database changes and NO new environment variables.

---

## What this release changes

A short list of improvements:

1. **Token binding:** Bridge sockets send their token in the Socket.IO handshake. The server verifies it is an ES256 token signed by SafetyScore.
2. **Duplicate socket kick:** When a bridge connects with the same `agentId` twice, the old socket is kicked so only one lives at a time.
3. **Room split:** Bridge sockets join `bridge:<agentId>`. Browser sockets join `agent:<agentId>`. Commands only go to bridges — browsers never see them.
4. **Expiry sweep:** Every 15 seconds, the server checks bridge tokens. If a token expired, it sends `auth:expired` to the bridge. 15 seconds later, it kicks the socket if still expired.
5. **Bulk endpoints:** Two new REST endpoints: `POST /console/accounts/:accountLogin/stop-all` (disable all EAs on one account) and `POST /console/kill-all` (kill all your EAs). Both return a summary with per-EA results.
6. **Per-EA rate limits:** All commands and bulk endpoints have throttles (10-20 per minute).

---

## Deploy steps on Proxmox VM

### 1. Connect to the host

```bash
ssh root@<Proxmox IP>
```

### 2. Enter the backend directory

```bash
cd /root/run-bot-backend
```

### 3. Pull the latest code

```bash
git pull
```

### 4. Build the Docker image

```bash
docker compose build
```

### 5. Start the container

```bash
docker compose up -d --force-recreate
```

This will restart the app. The old container is removed. The new one starts fresh.

---

## How to check it worked

### Check the logs

```bash
docker compose logs -f --tail 50
```

You should see:
- `ConsoleScheduler` logs showing the app started.
- Note: the 15-second expiry sweep is SILENT when nothing is expired. You will NOT see a log line every 15 seconds — that is normal. It only logs a warning line (`expired bridge socket kicked ...`) when it actually kicks an expired bridge.

Wait 5–10 seconds, then press `Ctrl+C` to stop following logs.

### Check the dashboard

Go to your web dashboard and look at the console page. You should see live EAs and telemetry. Click on an EA name to open its detail panel. You should see commands working (e.g., toggling MASTER_ENABLE).

### Test a REST endpoint (optional)

Get a fresh browser token from the SafetyScore website. Then in a terminal:

```bash
curl -H "Authorization: Bearer <YOUR_BROWSER_TOKEN>" \
  http://localhost:3000/console/instances
```

This should list your EAs. If it returns a 200 with a JSON array, the API works.

---

## Rollback (if needed)

### 1. Find the previous commit

```bash
git log --oneline | head -5
```

Pick the previous commit SHA (the one you want to go back to).

### 2. Revert to that commit

```bash
cd /root/run-bot-backend
git checkout main && git reset --hard <PREVIOUS_SHA>
```

Example:
```bash
git checkout main && git reset --hard a3b5c7f
```

### 3. Rebuild and restart

```bash
docker compose build
docker compose up -d --force-recreate
```

### 4. Check the logs again

```bash
docker compose logs -f --tail 50
```

Wait for the old version to start, then stop logs with `Ctrl+C`.

---

## No changes needed

- No new environment variables to set.
- No database migrations to run (`supabase db push`).
- No new secrets or config files.
- The MT5 client (DLL) does NOT need a new build for this release.

---

## Contact

If the app fails to start:
1. Check logs: `docker compose logs --tail 100`.
2. Look for error messages (usually near the top of the logs).
3. If the error mentions missing dependencies, try `docker compose build --no-cache` and then `docker compose up -d --force-recreate` again.
