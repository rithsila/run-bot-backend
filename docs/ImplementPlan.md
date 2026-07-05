# Run Bot — Implementation Plan (v3)

**Last rewritten:** 2026-06-23. This version replaces v1 (Supabase Edge Functions backend)
and v2 (DLL-direct transport, no bridge). See the revision note at the bottom for why.

**Feature:** A new `/dashboard/run-bot` tab in the SafetyScore user dashboard that lets a
user remote-control their MT5 trading EA (start/stop, clear positions, kill switch, change
settings, watch live data, record PnL) — without RDP into the VPS.

**Complexity:** Large. Spans an MT5 client change (EA + DLL), a small Go bridge change,
a backend cleanup (run-bot-api), a self-hosting step (Proxmox), and a React frontend port.

---

## 1. Locked architecture

The design splits into two backends on purpose:

- **License** is low volume → stays on the existing **SafetyScore Supabase** (free tier is fine).
- **Telemetry/commands** are high volume → go to a **self-hosted run-bot-api** on your own
  Proxmox hardware. This never touches Supabase, so there is no per-message cost and no
  free-tier limit.

```
Sn1P3r EA   (console_panel.mq5 folded in — one program, no GlobalVariable IPC)
  │
  ├─ LICENSE                                            ┌──────────────────────────────┐
  │    SafetyScore.dll  ──(Ed25519, WinHTTP)──────────► │ SafetyScore Supabase (free)  │
  │    returns: license OK  +  bot-session token        │   license-verify (UNCHANGED) │
  │                                                      │   + bot-token (NEW)          │
  │                                                      └──────────────────────────────┘
  │
  └─ TELEMETRY / COMMANDS
       EA binds ZMQ 5555/5556  ──►  Go bridge  ──(Socket.IO)──►  run-bot-api (slimmed)
       (in-process state)            (on MT5 VPS)                 self-hosted on Proxmox VM
                                                                  NestJS + MongoDB + Redis
                                                                       │  Socket.IO /console
                                                                       ▼
                                                   SafetyScore web app  /dashboard/run-bot
                                                   (bhub-new-ui components, restyled Liquid Glass)
```

**Reachability:** the Go bridge runs on the Windows MT5 VPS and must reach run-bot-api over the
internet. The browser must reach it too. Both go through a **Cloudflare Tunnel** that fronts
run-bot-api with HTTPS — no public IP or port-forwarding on the Proxmox VM.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| License backend | Existing SafetyScore Supabase. DLL Ed25519 → `license-verify`. Revenue path stays. |
| License via bridge | **Removed.** The bridge no longer validates licenses. The DLL does it. |
| Run-bot backend | **Reuse run-bot-api**, slimmed to the `console` module, self-hosted on Proxmox. |
| Backend infra | **Slim it.** Keep `console/` + Mongo (durable data). **Drop Redis + BullMQ** — single instance, in-memory telemetry cache. |
| Identity authority | **SafetyScore only.** run-bot-api deletes its memberships/auth/user modules. |
| Bot-session token | **ES256 JWT** signed by SafetyScore, verified by run-bot-api's existing `JoseService` (no new crypto). |
| Command auth | Commands (REST + socket) verified by **one minimal SafetyScore-token guard** + owner check. Replaces `JwtAuthGuard`, so deleting `auth/` is safe. |
| Bridge transport | **Keep ZMQ + Go bridge.** Bridge ↔ run-bot-api stays **Socket.IO** (small change). ZMQ binds **127.0.0.1 only**. |
| Browser realtime | **socket.io-client** in the SafetyScore web app, pointed at Proxmox run-bot-api. |
| console_panel.mq5 | **Folded into the EA** as `.mqh` includes. No separate program, no GVs. |
| Hosting | Docker Compose (**run-bot-api + MongoDB**, no Redis) + Cloudflare Tunnel on Proxmox. |
| Settings presets | In scope (run-bot-api already implements them). |

---

## 3. Identity & auth flow (the critical new part)

run-bot-api keeps **zero** license logic and **zero** user accounts. It trusts tokens that
SafetyScore signs. One signing keypair: SafetyScore holds the private key; run-bot-api holds the
public key. Tokens are short-lived (~60 min) **ES256 JWTs** — run-bot-api's existing `JoseService`
already verifies ES256, so this is a key swap, not new crypto.

```
TOKEN CLAIMS:  { user_id, agent_id, license_key, account_login, symbol, aud:"bhub-console", exp }
               (license_key/account/symbol are REQUIRED so bridge:register can persist
                the instance — without them the browser can never subscribe)

BRIDGE PATH (bot token)
  EA → SafetyScore.dll → bot-token (Supabase)  ──►  signed token
  EA → ZMQ handshake { agentId, token } → Go bridge   (ZMQ bound to 127.0.0.1)
  Go bridge → Socket.IO /console  (auth.token = bot token)
  run-bot-api verifies signature → bridge:register persists ea-instances.userId = token.user_id
  ORDERING: bridge:register MUST land before any browser client:subscribe succeeds.

  TOKEN REFRESH (token TTL ~60 min, so this fires in normal use):
    run-bot-api emits auth:expired → bridge requests a fresh token from the EA over a ZMQ
    control frame → EA returns the DLL's latest token → bridge re-auths. No /memberships call.

BROWSER PATH (browser token)
  Browser (logged in via Supabase) → SafetyScore server action → signed browser token
  Browser → Socket.IO /console (auth.token) + client:subscribe { agentId }
  run-bot-api verifies signature → allows only if ea-instances.userId == token.user_id

COMMANDS (REST + socket)
  run-bot-api's console.controller + gateway use ONE minimal token guard (verify ES256 +
  owner check), replacing the deleted JwtAuthGuard. Ported UI hooks keep their HTTP calls.
```

Why this is safe: no valid SafetyScore license → the DLL returns no bot token → run-bot-api
rejects the socket. The bot is still gated by the license, just not by the bridge.

**Decided (2026-06-23):** mint the bot token from a **new `bot-token` Edge Function** that
reuses extracted `license-core.ts`, rather than editing `license-verify` directly. This keeps
the revenue-path response byte-for-byte unchanged. The change to Supabase functions must run
the `sdd-license-flow-audit` skill and a `license-verify` regression test before merge.

---

## 4. What we keep / build / delete

### MT5 client (`console panel/EA Sn1P3r Grid Hunter/`, `Dll/`)
| Action | Item |
|---|---|
| KEEP | ZMQ layer, `libzmq.dll`, `libsodium.dll`, the trading logic. |
| FOLD IN | `console_panel.mq5` → `.mqh` modules inside the EA (telemetry, commands, user32 toggle). |
| CHANGE | EA reads in-process state, not GlobalVariables. EA binds ZMQ on **`127.0.0.1`** (not `*`). |
| DELETE | The EA's current direct `WebRequest` license call (lines ~247–388). |
| ADD | DLL: surface the bot-session token to the EA. EA answers a bridge token-refresh request over a ZMQ control frame. |

### Go bridge (`console panel/vps-bridge/`)
| Action | Item |
|---|---|
| KEEP | `zmq.go`, `socketio.go`, `commands.go`, `heartbeat.go`, `handshake.go`, installer. |
| CHANGE | `handshake.go`: accept `{ agentId, token }`. `socketio.go`: auth with the EA-supplied token; on `auth:expired`, request a fresh token from the EA over ZMQ (do **not** call `/memberships/activate`). `config.go`: point at the Proxmox run-bot-api URL. |
| DELETE | `license.go`, `license_dispatch.go`, and the ZMQ `license_check` path. |

### run-bot-api (`run-bot-api/`)
| Action | Modules |
|---|---|
| KEEP | `console/`, `common/`, `config/`, `middleware/`. |
| ADD | A minimal **SafetyScore-token guard** (ES256 verify + owner check) used by BOTH `console.gateway.ts` and `console.controller.ts`, replacing `JwtAuthGuard`/`RolesGuard`. This is what makes deleting `auth/` safe. |
| CHANGE | `console.gateway.ts` auth: single ES256 verify against the SafetyScore public key; drop the RS256/membership paths. `ea-instances.userId` = SafetyScore uuid. Telemetry cache → **in-memory Map with TTL** (no Redis). |
| DELETE | `redis/`, `queue/` (BullMQ), `real-time/` (separate namespace, unused here), `memberships/`, `subscriptions/`, `order/`, `coupons/`, `products/`, `auth/`, `user/`, `analyze-news/`, `trading-plan/`, `indicator/`, `retailer/`, `robots/`, `plan/`, `mail/`, `turnstile/`, `web-push-sub/`. |
| KEEP (lib) | `JoseService` ES256 verify (point it at the SafetyScore public key). |

### SafetyScore web app (`web/`)
| Action | Item |
|---|---|
| ADD | `socket.io-client` (and `@tanstack/react-query` if the ported hooks need it). |
| ADD | Server action / route handler that mints a browser bot-session token from the Supabase session. |
| PORT | `bhub-new-ui/components/console/*` (11 components + 6 panels) → `web/src/components/run-bot/`, restyled to Liquid Glass tokens. |
| PORT | `useConsoleSocket`, `useConsoleSettings`, `settings-schema.ts` → `web/src/lib/run-bot/`, pointed at the Proxmox run-bot-api URL. |
| ADD | `web/src/app/dashboard/run-bot/page.tsx` + enable the sidebar nav item. |

### Supabase (`supabase/`)
| Action | Item |
|---|---|
| ADD | `bot-token` Edge Function (reuses extracted `license-core.ts`). |
| EXTRACT | `_shared/license-core.ts` from `license-verify` (+ regression test proving no behavior change). |
| ADD | One signing keypair for bot-session tokens (private in Supabase + web app; public in run-bot-api). |

---

## 5. Hosting (Proxmox)

- `docker-compose.yml`: services `run-bot-api`, `mongo` (**no Redis, no BullMQ**). Volume for Mongo data.
- Restart policy `unless-stopped`; the VM auto-starts the stack on boot.
- **Cloudflare Tunnel** exposes run-bot-api at a stable HTTPS hostname. The bridge and the
  browser both use that hostname. No port-forwarding. (Note: the tunnel is a single point of
  failure for both lanes — add basic up/down alerting.)
- run-bot-api env: `MONGO_URI`, `SAFETYSCORE_TOKEN_PUBLIC_KEY` (ES256), CORS allowlist =
  the SafetyScore web domain.
- Backups: periodic `mongodump` (settings + audit + instances are the only durable data).

---

## 6. Phases & tasks

Three lanes run in parallel after the contracts/keys land. They touch disjoint roots
(`supabase/` + `web/`, `run-bot-api/`, `console panel/`).

> **BUILD PROGRESS (2026-06-23) — verified green, all UNCOMMITTED on each repo's working tree:**
> - RB-00 ✓ `docs/run-bot/contracts.md`.
> - RB-10 ✓ `_shared/license-core.ts` + tests (Deno suite 102/102; fixed a latent `database.ts` log-shadowing bug).
> - RB-20/21 ✓ run-bot-api slimmed to `console` + ES256 token guard; `npm run build` clean; 55 tests pass. (~20 modules deleted, incl. `storage/`.)
> - RB-01/11 ✓ ES256 keypair + `bot-token` Edge Function reusing license-core; 7 tests pass.
> - RB-30 ✓ Go bridge re-pointed to run-bot-api, license path deleted, token-refresh-over-ZMQ; `go vet`/`build`/`test -race` all green.
> - RB-50/51 ✓ web run-bot route + nav + server-only token mint + ported socket hooks; `pnpm types:check` passes, new files lint-clean.
> - RB-52/53/54/55 ✓ telemetry UI (TelemetryGrid + 6 panels), KillSwitchPanel (2-step + ACK timeout) + ActionsPanel,
>   SettingsPanel (schema from real EA params, 55 fields/10 groups, restart-required reject),
>   InstanceSelector (?agentId=) + ConnectionStatusBar, wired in run-bot-shell. `types:check`/`lint`/`test` green
>   (web 226 pass + run-bot-api 58 pass). ~~**GAP:** run-bot-api needs `close-buy`/`close-sell` REST routes.~~
>   **GAP CLOSED 2026-06-25** — routes added (run-bot-api 74 pass); see RB-53 note below.
>
> **SECURITY:** the keypair generated in RB-01 was printed to the build transcript → treat it
> as EXPOSED/dev-only. Regenerate for production via `_shared/__scripts__/gen-bot-token-key.ts`
> and never paste a real private key into chat/logs.
>
> **Before merge:** run `sdd-license-flow-audit` (RB-10/RB-11 touch the license/token path).
>
> **RB-22 (2026-06-24):** Docker code part DONE on `feat/run-bot-slim` (0c4e737) — `Dockerfile`,
> `docker-compose.yml` (run-bot-api + mongo, no Redis), `.dockerignore`, `.env.docker.example`, `DEPLOY.md`.
> Verified locally: image builds, stack boots Mongo-only, `/health` ok. Live Cloudflare Tunnel still pending your CF account.
>
> **RB-53 GAP CLOSED + RB-60 DONE (2026-06-25):** added `close-buy`/`close-sell` REST routes (run-bot-api,
> feat/run-bot-slim) and built PnL history end-to-end (run-bot-api snapshots + web recharts chart). run-bot-api
> 74 tests pass; web 232 tests pass. See RB-53 GAP note + RB-60 below.
>
> **NOT yet built (need Windows/MetaEditor or your infra):** RB-12 DLL token surface,
> RB-40/41 EA fold-in + token plumbing (MQL5), RB-22 live Cloudflare Tunnel (your CF account),
> RB-62 live VPS. **Buildable here: none remaining** (RB-61 mock E2E + RB-63 security pass still open).

### Phase 0 — Contracts, keys, gate
- ✅ **RB-00 Contracts doc** `[DONE — feat/run-bot]` — `docs/run-bot/contracts.md`: token claims, Socket.IO events
  (`bridge:register`, `console:telemetry`, `console:ack`, `console:status`, `console:offline`,
  `client:subscribe`), HTTP endpoints, telemetry JSON shape, command verbs, settings shape.
  *Validate: doc review.*
- ✅ **RB-01 Signing keypair** `[DONE — feat/run-bot; ⚠️ dev key exposed in logs, REGENERATE for prod]` — generate the **ES256** bot-token keypair. Private → Supabase +
  web app env; public → run-bot-api env. Document in `.env.production.rotated`. *Validate: sign/verify round-trip script (Supabase signer ↔ run-bot-api JoseService).*
- ⬜ **RB-02 Gate: token end-to-end spike** `[PARTIAL — unit-level verify/reject covered by RB-11 + RB-20/21 tests; full bridge↔run-bot-api↔browser e2e NOT run yet]` — prove a SafetyScore ES256 token is accepted by a
  slimmed run-bot-api `/console` socket **and** the token guard on the REST controller, and
  rejected when the signature/owner is wrong. *Depends on RB-20's token guard existing.*
  *Validate: valid token connects + can POST a command; tampered token → reject; wrong owner → subscribe + command denied.*

### Phase 1 — Supabase license/token (Lane A)
- ✅ **RB-10 Extract `_shared/license-core.ts`** `[DONE — feat/run-bot; Deno suite 102/102]` from `license-verify` + **regression test**
  proving the license response is byte-for-byte unchanged. **CRITICAL — revenue path.**
- ✅ **RB-11 `bot-token` Edge Function** `[DONE — feat/run-bot; 7 tests]` — reuse `license-core`; on valid+active+account-bound
  license, return an **ES256** bot-session token with all required claims (`user_id`,
  `agent_id`, `license_key`, `account_login`, `symbol`). Rate-limited. *Validate: valid license → token with all claims; wrong account → 403; expired → 403.*
- ⬜ **RB-12 DLL bot-token surface** `[TODO — needs Windows/C++ build]` — extend `SafetyScore.dll` so the EA can read the token from
  the license response. Bump `GetDLLVersion`. *Validate: EA reads a non-empty token after license OK.*
- ⬜ Run `sdd-license-flow-audit` before merging RB-10/11/12. `[TODO before merge]`

### Phase 2 — run-bot-api cleanup + self-host (Lane B, parallel)
- ✅ **RB-20 Strip modules + token guard** `[DONE — feat/run-bot-slim; npm build clean, 55 tests]` — delete the modules in §4 (incl. `redis/`, `queue/`,
  `real-time/`, `auth/`). Add the minimal **ES256 token guard** used by the gateway AND the
  REST controller (replaces `JwtAuthGuard`). Telemetry cache → in-memory Map+TTL.
  *Validate: `npm run build` clean; app boots with **Mongo only** (no Redis); controller routes guarded by the new token.*
- ✅ **RB-21 Token auth wiring** `[DONE — feat/run-bot-slim; landed with RB-20]` — `console.gateway.ts` + `console.controller.ts` verify SafetyScore
  ES256 tokens; ownership by `token.user_id`; `bridge:register` requires `license_key`/`account`/
  `symbol` and must precede `client:subscribe`. *Validate: unit test verify+reject; owner check on subscribe AND command; register-before-subscribe.*
- ✅ **RB-22 Dockerize + tunnel** `[CODE DONE — feat/run-bot-slim 0c4e737; live tunnel wiring pending your Cloudflare account]` — `docker-compose.yml`
  (**run-bot-api + mongo**, no Redis), `Dockerfile`, `.dockerignore`, `.env.docker.example`, CORS allowlist
  via `FRONTEND_URL` (fail-fast), `/health` container+compose healthchecks, Mongo internal-only on a named
  volume, `restart: unless-stopped`. `DEPLOY.md` documents the Cloudflare Tunnel step (host + container
  `cloudflared` pointing at the run-bot-api container). *Verified locally: image builds; stack boots with Mongo
  only; `/health` → ok.* **REMAINING (your infra):** live Cloudflare Tunnel + up/down alerting; bridge +
  browser reaching `/console` over HTTPS (RB-31/RB-62).

### Phase 3 — Go bridge re-point (Lane B, after RB-21 contract)
- ✅ **RB-30 Handshake + auth + refresh** `[DONE — feat/run-bot-bridge; go vet/build/test -race green]` — `handshake.go` parses `{ agentId, token }`; `socketio.go`
  uses it for `/console` auth and, on `auth:expired`, requests a fresh token from the EA over a
  ZMQ control frame; delete `license.go`/`license_dispatch.go` + the `license_check` ZMQ path;
  `config.go` → Proxmox URL; ZMQ bind `127.0.0.1`. *Validate: `go vet`; `go test -race` with a mock /console incl. an expiry→refresh cycle.*
- ⬜ **RB-31 Rebuild + release** `[TODO — needs Windows build + test VPS]` — `make build-windows`, same embedded `.ex5`/DLLs. New
  `bridge.env` keys. *Validate: `--status` on a test VPS connects to run-bot-api.*

### Phase 4 — MT5 EA (Lane C, parallel)
- ⬜ **RB-40 Fold panel into EA** `[TODO — needs MetaEditor/MQL5]` — port `console_panel.mq5` to `.mqh` modules: telemetry from
  in-process state, command applier (`KILL_SWITCH`/`KILL_RESET`/`MASTER_ENABLE`/`CLOSE_BUY`/
  `CLOSE_SELL`/`SETTINGS`), `user32` AutoTrading toggle, EA-owned ZMQ sockets. Delete the EA's
  direct WebRequest license call. *Validate: EA compiles; panel reads live state.*
- ⬜ **RB-41 EA token plumbing** `[TODO — needs MetaEditor/MQL5]` — EA gets the token from the DLL after license OK, sends it in
  the ZMQ handshake, and answers the bridge's ZMQ token-refresh request with the DLL's latest
  token. **Transport failure must never block trading.** *Validate: token flows EA→bridge; refresh request answered; if cloud is down, trading continues.*

### Phase 5 — Frontend (Lane A/web, parallel)
- ✅ **RB-50 Route + nav** `[DONE — feat/run-bot; types:check passes]` — `dashboard/run-bot/page.tsx` (Server Component: `getCachedUser`,
  mint browser token, list the user's instances); enable the sidebar item. *Validate: tab + empty state.*
- ✅ **RB-51 Port hooks** `[DONE — feat/run-bot; spine, pending live telemetry verify]` — `useConsoleSocket`/`useConsoleSettings` → `web/src/lib/run-bot/`,
  pointed at run-bot-api, token from the server action. *Validate: live telemetry updates.*
- ✅ **RB-52 Port telemetry UI** `[DONE — feat/run-bot; types/lint/test green]` — `TelemetryGrid` + 6 panels in
  `web/src/components/run-bot/`, restyled to Liquid Glass (local `Card`/`.glass-panel`). Adapted from the
  source flat shape to the nested contract §6 shape. Stale-overlay (>10s) + feature bitmask preserved; pure
  logic extracted to `lib/run-bot/telemetry-format.ts`. *Validated: 18 vitest unit tests (stale + bitmask + maps).*
- ✅ **RB-53 Actions** `[DONE — feat/run-bot; types/lint/test green]` — `KillSwitchPanel` (2-step "type KILL" +
  10s ACK timeout) + `ActionsPanel` (start/stop = master-enable, clear buy/sell). Commands via REST
  (`lib/run-bot/commands.ts`, contracts §5) with sonner ACK toasts. 2-step gate extracted to a pure
  `lib/run-bot/kill-switch-machine.ts`. *Validated: 9 vitest unit tests (transitions + execute guard).*
  > **GAP RESOLVED (2026-06-25, feat/run-bot-slim):** the two REST routes now exist —
  > `POST /console/instances/:agentId/close-buy` and `/close-sell`, guarded by `SafetyScoreTokenGuard`
  > + owner check + online check, throttled 20/min, dispatching the existing `CLOSE_BUY`/`CLOSE_SELL`
  > verbs with new `AuditEvent.CloseBuy`/`CloseSell` audit logging. Documented in contracts §5.
  > *Validated: 9 new run-bot-api service tests; `npm run build`/`test` (74 pass).*
- ✅ **RB-54 Settings + presets** `[DONE — feat/run-bot; types/lint/test green]` — canonical schema
  `web/src/lib/run-bot/settings-schema.ts` derived from the EA's real `input` params
  (`Sn1P3r Grid Hunter.mq5`) as the single source of truth. 55 fields in 10 groups; each carries a
  `restartRequired` flag grounded in the EA source (indicator handles created in `OnInit` —
  ATRPeriod/BBPeriod/BBDeviation/p_G02–p_G05/BasketTP_ATRSmoothPeriod — plus magic-number identity).
  **THREE-WAY MISMATCH resolved:** dropped non-EA keys (`MaxTradesPerSide`, `Slippage`, `TradeComment`,
  and the old UI's `MagicNumber`/`MaxBuyTrades`/`SignalGateEnabled`/`Stoch*`/hour-split session fields);
  aligned run-bot-api `ALLOWED_SETTINGS_KEYS` to the live subset (`LIVE_SETTINGS_KEYS`) and added an
  explicit server-side reject for restart-required keys (defense in depth). `SettingsPanel` ported to
  Liquid Glass with diff dialog + local presets; restart-required fields are read-only and never pushed
  (`pushableSettings` = changed ∩ live keys). *Validated: 18 web schema unit tests + 3 new run-bot-api
  service tests (removed-keys rejected, restart-required rejected live, reconciled live keys accepted);
  `pnpm types:check`/`lint`/`test` (226 pass) + run-bot-api `npm run build`/`test` (58 pass) green.*
  > **NOTE:** presets are localStorage-only — the slimmed run-bot-api dropped the server-side preset
  > endpoints. Server-synced presets can be added later if needed.
- ✅ **RB-55 Instance selector + status bar** `[DONE — feat/run-bot; types/lint/test green]` — `InstanceSelector`
  (`?agentId=` param, server-read + `router.replace`) over `lib/run-bot/use-bot-instances.ts` (GET
  `/console/instances`), + `ConnectionStatusBar` (bridge/MT5 online dots, last-seen counter, >5min offline banner).

### Phase 6 — PnL + hardening
- ✅ **RB-60 PnL history** `[DONE — feat/run-bot-slim (run-bot-api) + feat/run-bot (web); build/test green]` — store periodic PnL points (Mongo) + a `recharts` chart. *Validate: chart renders; survives refresh.*
  Completed 2026-06-25. run-bot-api: `EaPnlPoint` schema + `ea-pnl-points` collection (compound index agentId+ts),
  `ConsoleService.recordPnlPoint`/`getPnlHistory` (owner check, capped at 2000), scheduler cron `recordPnlSnapshots`
  (1/min over online instances), server-guarded `GET /console/instances/:agentId/pnl?limit=N`. web: `usePnlHistory`
  hook (react-query, 60s refetch, pure `sanitizePnlPoints`/`formatChartTime`) + `PnlChart` recharts area chart wired
  into `run-bot-shell`. Survives refresh by design (history persisted server-side, fetched on mount). *Validated:
  run-bot-api `npm run build`/`test` (74 pass, +7) + web `types:check`/`lint`(new files clean)/`test` (232 pass, +6).*
- ⬜ **RB-61 Mock E2E** `[TODO]` — `mock-mt5` → bridge → run-bot-api → browser, locally. *Validate: telemetry ≤3s; kill ACK.*
- ⬜ **RB-62 Live VPS** `[TODO — needs your VPS + Proxmox + Windows build]` — real MT5 demo + new `.exe`/`.ex5`/DLL, run-bot-api on Proxmox. *Validate: all actions confirmed.*
- ⬜ **RB-63 Security pass** `[TODO]` — token tamper/owner cross-user test, CORS, rate limits, no key
  leakage to the browser bundle. Use `security-reviewer`. *Validate: cross-user denied; clean scan.*

---

## 7. Tests (must ship with the code)

- **CRITICAL:** `license-verify` regression test after RB-10 extract (revenue path unchanged).
- Token sign/verify round-trip + expiry + tamper (ES256; Supabase signer ↔ run-bot-api `JoseService`).
- run-bot-api owner check: user B cannot subscribe to OR command user A's `agentId` (REST + socket).
- run-bot-api: `bridge:register` must persist before `client:subscribe` succeeds (lockout regression).
- Bridge: token-refresh cycle — `auth:expired` → ZMQ request → EA returns token → re-auth.
- EA: trading continues when the cloud/bridge is down (transport is non-blocking).
- Settings schema: reject unknown/out-of-range/restart-required values (vitest + EA-side).
- Frontend: telemetry parsing, feature bitmask, kill-switch 2-step + ACK timeout.
- Bridge: `go test -race` against a mock `/console` (auth, reconnect, command ACK).

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Editing `license-verify` breaks the revenue path | Medium | Mint token from a separate `bot-token` fn reusing `license-core`; regression test; `sdd-license-flow-audit`. |
| Self-hosted run-bot-api down → no dashboard | Medium | Trading is unaffected (license is separate). Restart policy + tunnel health. |
| Browser token signing key leaks into the client bundle | High if careless | Sign **server-side only** (server action). Public key only in run-bot-api. Add a build check. |
| Two-system clock skew on token expiry | Low | Allow small leeway on verify; re-auth on 401. |
| DLL must be rebuilt + re-released to every user | Certain | Versioned rollout; EA gates on min `GetDLLVersion`. |
| Bridge `.exe` re-release | Certain | Small change; keep installer; document upgrade. |
| Mongo data loss on the VM | Medium | `mongodump` backups; only settings/audit/instances are durable. |
| Settings schema drift vs EA source (financial safety) | Medium | A pushed value the EA rejects or that needs a restart mid-trade is a safety bug, not cosmetic. Single source = the EA's real params; UI schema derived from it; reject restart-required keys live (RB-54). |
| Cloudflare Tunnel down → no telemetry AND no commands | Medium | Single point of failure for both lanes. Add up/down alerting; trading itself is unaffected (license is separate). |
| Command path unauthenticated after deleting `auth/` | Medium | One ES256 token guard covers both REST controller and socket (RB-20); RB-02 gate proves it before lanes start. |
| Blocking HTTP/ZMQ stalls the trade thread | Medium | Transport on `OnTimer` with short timeouts; never `OnTick`; guard so failure is non-blocking. |

---

## 9. NOT in scope (v1)

- Moving license off Supabase — it stays; only `bot-token` is added.
- run-bot-api's billing/membership/auth features — deleted, not ported.
- Web-push offline alerts — run-bot-api had these; revisit later via SafetyScore email/notify.
- Additional EAs (FlexGridPro) — add a settings schema + an `eaType` later; no rearchitecture.
- "Copy Bot" tab — separate effort.
- Supabase Realtime, Edge-Function telemetry, migration 042, product-catalog prerequisite —
  all dropped (those belonged to v1/v2).

---

## 10. Acceptance

- [x] License unchanged: DLL Ed25519 → `license-verify`; regression test green. *(RB-10, Deno 102/102)*
- [x] `bot-token` issues a valid token only for an active, account-bound license. *(RB-11, 7 tests)*
- [x] run-bot-api slimmed to `console`; builds with **Mongo only** (no Redis/BullMQ); no membership/auth modules. *(RB-20, build clean + 55 tests)*
- [x] run-bot-api accepts SafetyScore tokens, rejects tampered/foreign ones; owner check enforced. *(RB-21, unit-tested; live e2e pending RB-02)*
- [ ] Bridge connects to Proxmox run-bot-api with the EA-supplied token; no `/memberships/activate`. *(code done RB-30; live connect pending RB-22/RB-31)*
- [ ] EA has the panel folded in; trading continues if the cloud is down.
- [ ] `/dashboard/run-bot` shows live data, start/stop, clear, kill switch, settings, presets.
- [x] PnL recorded and charted. *(RB-60: run-bot-api snapshots + web recharts chart; build/test green; live capture pending RB-62)*
- [ ] Cloudflare Tunnel reaches run-bot-api for both bridge and browser.
- [ ] `pnpm types:check`, `pnpm lint`, `pnpm test`, `deno test`, `go test -race` all pass.
- [ ] Live VPS E2E on a demo account confirmed.
- [ ] Security pass clean (RB-63): cross-user denied, no signing key in the client bundle.

---

## Revision note

- **v1 (superseded):** run-bot backend = new Supabase Edge Functions + Realtime; license
  reused via `activation-policy`. Dropped because high-frequency telemetry does not fit the
  Supabase free tier (one always-on bot at 3s exceeds 500K calls/month).
- **v2 (superseded):** dropped the Go bridge and ZMQ; EA talked to Supabase directly via the
  DLL. Dropped because the user chose to reuse the proven run-bot-api console stack and keep ZMQ.
- **v3 (this doc):** license on Supabase (DLL), telemetry on self-hosted run-bot-api (Proxmox),
  ZMQ + Go bridge kept, UI ported into SafetyScore, SafetyScore as the single identity authority.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | FAILED | Codex auth 401; fell back to Claude subagent |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_RESOLVED | v3 rewrite; 6 decisions locked; outside voice ran; 5 gaps fixed; tests in §7 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (UI is a port + restyle) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**Decisions locked (2026-06-23):**
1. Backend split — license on Supabase (DLL), telemetry on self-hosted run-bot-api (Proxmox).
2. Identity — SafetyScore is the sole authority; run-bot-api is a trusted relay (memberships/auth/user deleted).
3. Browser realtime — reuse bhub-new-ui socket.io hooks; Hosting — Docker Compose + Cloudflare Tunnel.
4. Bot-token — new `bot-token` Edge Function reusing extracted `license-core` (isolates revenue path).
5. Slim infra — drop Redis + BullMQ; keep Mongo only; in-memory telemetry cache.
6. Scope — full remote-control in v1 (telemetry-first was offered and declined).

**OUTSIDE VOICE (Claude subagent — Codex was unavailable):** found 5 concrete gaps, all now
applied — (1) command path broke on deleting `auth/` → one ES256 token guard for REST + socket;
(2) ES256 not EdDSA (matches run-bot-api's existing crypto); (3) token refresh designed over a ZMQ
control frame; (4) ZMQ binds `127.0.0.1`; (5) token claims + register-before-subscribe ordering locked.

**CROSS-MODEL TENSION (resolved by user):** reviewer pushed for telemetry-first scope and lighter
infra. User accepted lighter infra (decision 5), kept full-control scope (decision 6).

**UNRESOLVED:** 0. **Confirm at build time:** settings-schema vs the EA's real params (RB-54).

**VERDICT:** ENG REVIEW COMPLETE. Architecture locked, outside voice incorporated, gaps fixed,
tests specified. CEO/Design/DX not run (optional here). Ready to implement lane by lane — start
with RB-10 (license-core extract + regression test) and RB-20 (token guard); they gate everything else.
