# Install bhub-api on Proxmox LXC for UAT

This guide shows how to install the **bhub-api** backend on a Proxmox LXC container for UAT (User Acceptance Testing).

The guide is written in simple steps. Follow each step in order.

---

## 1. What You Will Install

**bhub-api** is a NestJS backend (Node.js). It needs:

- **Node.js 22** and **pnpm** — to run the app
- **MongoDB 7** — the main database (**external server at `172.17.10.10`** — not installed in the LXC)
- **Redis 7** — cache and job queue (BullMQ, Socket.IO adapter) — **external server at `172.17.10.10`** — not installed in the LXC
- **Nginx** (optional) — reverse proxy with TLS
- **PM2** — to keep the app running in the background

The app listens on **port 4000** by default.

---

## 2. Before You Start

You need:

- A Proxmox VE host (8.x recommended)
- A **Debian 12** or **Ubuntu 22.04** LXC template downloaded in Proxmox
- Root access to Proxmox (SSH or web console)
- Network access from the LXC to the internet (to install packages)
- A domain name or IP for UAT (example: `uat-api.bhub.local`)
- **Network access from the LXC to the database server at `172.17.10.10`** (MongoDB `27017`, Redis `6379`)
- MongoDB and Redis credentials for UAT (from the DBA / platform team)

---

## 3. Create the LXC Container

On the Proxmox host shell, create an unprivileged LXC.

Recommended resources for UAT:

| Item | Value |
|---|---|
| CPU | 2 cores |
| RAM | 4 GB |
| Swap | 1 GB |
| Disk | 20 GB |
| OS | Debian 12 |

Example command (replace IDs and paths for your host):

```bash
pct create 200 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname bhub-api-uat \
  --cores 2 \
  --memory 4096 \
  --swap 1024 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1
```

Notes:

- `nesting=1` is needed if you want to run Docker inside later.
- Use a static IP instead of `dhcp` if you plan to expose it.

Enter the container:

```bash
pct enter 200
```

---

## 4. Update the System

Inside the LXC:

```bash
apt update && apt upgrade -y
apt install -y curl wget git ca-certificates gnupg lsb-release build-essential ufw
```

Set the timezone:

```bash
timedatectl set-timezone Asia/Phnom_Penh
```

---

## 5. Install Node.js 22 and pnpm

Install Node.js 22 from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

Check the version:

```bash
node -v    # should show v22.x
npm -v
```

Install **pnpm** and **PM2** globally:

```bash
npm install -g pnpm pm2
```

---

## 6. Connect to External MongoDB (172.17.10.10)

MongoDB is **not installed inside the LXC**. The app connects to an existing MongoDB server at `172.17.10.10:27017`.

### 6.1 Install the Mongo shell only (for testing)

You only need `mongosh` to test the connection:

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] \
  https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
  | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt update
apt install -y mongodb-mongosh mongodb-database-tools
```

> `mongodb-database-tools` gives you `mongodump` / `mongorestore` for backups.

### 6.2 Check network reachability

From inside the LXC:

```bash
ping -c 3 172.17.10.10
nc -zv 172.17.10.10 27017
```

Both must succeed. If not, fix the network (Proxmox bridge, firewall, or routing) before continuing.

### 6.3 Ask the DBA for UAT credentials

You need these four values:

| Item | Example |
|---|---|
| Database name | `bhub_uat` |
| App username | `bhub_app` |
| App password | `CHANGE_ME_APP` |
| Auth source | usually the database name, e.g. `bhub_uat` |

If the DBA has not created them yet, they can run this on `172.17.10.10`:

```javascript
use bhub_uat
db.createUser({
  user: "bhub_app",
  pwd: "CHANGE_ME_APP",
  roles: [ { role: "readWrite", db: "bhub_uat" } ]
})
```

### 6.4 Test the connection from the LXC

```bash
mongosh "mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017/bhub_uat?authSource=bhub_uat"
```

Inside the shell:

```javascript
db.runCommand({ ping: 1 })
exit
```

If ping returns `{ ok: 1 }`, the app will be able to connect.

### 6.5 Your Mongo URI for `.env.staging`

```
mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017/bhub_uat?authSource=bhub_uat
```

If MongoDB is a replica set, use:

```
mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017,172.17.10.11:27017,172.17.10.12:27017/bhub_uat?authSource=bhub_uat&replicaSet=rs0
```

If TLS is enabled on the MongoDB server, append `&tls=true`.

---

## 7. Connect to External Redis (172.17.10.10)

Redis is **not installed inside the LXC**. The app connects to an existing Redis server at `172.17.10.10:6379`.

### 7.1 Install the Redis client only (for testing)

You only need `redis-cli` to test the connection:

```bash
apt install -y redis-tools
```

### 7.2 Check network reachability

From inside the LXC:

```bash
nc -zv 172.17.10.10 6379
```

Must succeed. If not, fix the network or the firewall on the Redis host before continuing.

### 7.3 Ask the platform team for UAT credentials

You need:

| Item | Example |
|---|---|
| Host | `172.17.10.10` |
| Port | `6379` |
| Password | `CHANGE_ME_REDIS` |
| Database index | `0` (default) or a dedicated DB, e.g. `2` for UAT |
| TLS | `yes` / `no` |

> **Note:** BullMQ and the Socket.IO Redis adapter both use pub/sub.
> The Redis server must have `notify-keyspace-events` enabled (BullMQ needs it) and **must not block `SUBSCRIBE` / `PSUBSCRIBE`** in its ACL.

### 7.4 Test the connection from the LXC

```bash
redis-cli -h 172.17.10.10 -p 6379 -a CHANGE_ME_REDIS ping
# should print: PONG
```

If Redis uses TLS:

```bash
redis-cli --tls -h 172.17.10.10 -p 6379 -a CHANGE_ME_REDIS ping
```

### 7.5 Your Redis URL for `.env.staging`

Plain:

```
redis://:CHANGE_ME_REDIS@172.17.10.10:6379
```

With a dedicated DB index (e.g. `2`):

```
redis://:CHANGE_ME_REDIS@172.17.10.10:6379/2
```

With TLS:

```
rediss://:CHANGE_ME_REDIS@172.17.10.10:6379
```

If there is a separate Redis user (ACL, Redis 6+):

```
redis://uat_user:CHANGE_ME_REDIS@172.17.10.10:6379
```

---

## 8. Get the Source Code

Create a dedicated user to run the app:

```bash
useradd -m -s /bin/bash bhub
su - bhub
```

As the `bhub` user, clone the repo:

```bash
git clone <your-git-url> bhub-api
cd bhub-api
```

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Build the app:

```bash
pnpm run build
```

---

## 9. Create the UAT Environment File

The app loads `.env.${NODE_ENV}` first, then falls back to `.env`.
For UAT, create `.env.staging`:

```bash
nano /home/bhub/bhub-api/.env.staging
```

Paste and fill in the values:

```ini
# ─── App ─────────────────────────────────────────────
NODE_ENV=staging
PORT=4000
FRONTEND_URL=https://uat.bhub.local
COOKIE_DOMAIN=.bhub.local

# ─── Database ────────────────────────────────────────
MONGO_URI=mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017/bhub_uat?authSource=bhub_uat

# ─── Redis ───────────────────────────────────────────
REDIS_URL=redis://:CHANGE_ME_REDIS@172.17.10.10:6379

# ─── JWT (Access Token) ──────────────────────────────
JWT_ISSUER=https://uat-api.bhub.local
JWT_AUDIENCE=bhub-uat
JWT_ACCESS_ALG=RS256
JWT_ACCESS_TTL=900
JWT_ACCESS_PRIVATE_KEY_BASE64=<base64-of-PEM-private-key>
JWT_ACCESS_PUBLIC_KEY_BASE64=<base64-of-PEM-public-key>
JWT_ACCESS_SECRET=
PW_RESET_TTL_MIN=20

# ─── Mail / SMTP (Gmail) ─────────────────────────────
MAIL_FROM_NAME=bhub UAT
MAIL_FROM_EMAIL=uat@bhub.local
GMAIL_APP_PASSWORD=<16-char-gmail-app-password>

# ─── Google OAuth ────────────────────────────────────
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://uat-api.bhub.local/auth/google/callback

# ─── AWS / S3 ────────────────────────────────────────
AWS_ACCESS_KEY_ID=<aws-access-key>
AWS_SECRET_ACCESS_KEY=<aws-secret-key>
AWS_REGION=ap-southeast-2
S3_BUCKET_NAME=bhub-uat-uploads

# ─── Internal signing / webhooks ─────────────────────
INTERNAL_HMAC_SECRET=<random-32-chars-or-more>

# ─── Web Push (VAPID) ────────────────────────────────
PUSH_VAPID_PUBLIC_KEY=<vapid-public>
PUSH_VAPID_PRIVATE_KEY=<vapid-private>
PUSH_VAPID_SUBJECT=mailto:admin@bhub.local

# ─── Cloudflare Turnstile ────────────────────────────
CF_TURNSTILE_SECRET=<turnstile-secret>

# ─── External issuer (EA signing) ────────────────────
ISSUER=https://uat-api.bhub.local
TOKEN_TTL_DAYS=30
SIGNING_KID=uat-2026-04
SIGNING_PRIVATE_JWK={"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}
PUBLIC_JWKS={"keys":[{"kty":"OKP","crv":"Ed25519","kid":"uat-2026-04","x":"..."}]}

# ─── API keys ────────────────────────────────────────
API_KEY=<random-api-key>
```

### How to create the JWT keys

Run this on your laptop (or inside the LXC) to generate an RSA key pair and encode as Base64:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt_private.pem
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem

base64 -w0 jwt_private.pem    # paste to JWT_ACCESS_PRIVATE_KEY_BASE64
base64 -w0 jwt_public.pem     # paste to JWT_ACCESS_PUBLIC_KEY_BASE64
```

### How to create VAPID keys

```bash
npx web-push generate-vapid-keys
```

### How to create the EA signing JWK

```bash
node -e "const {generateKeyPair,exportJWK}=require('jose');(async()=>{const {publicKey,privateKey}=await generateKeyPair('EdDSA');const priv=await exportJWK(privateKey);const pub=await exportJWK(publicKey);priv.kid=pub.kid='uat-2026-04';console.log('PRIVATE:',JSON.stringify(priv));console.log('PUBLIC JWKS:',JSON.stringify({keys:[pub]}));})()"
```

Lock the file permissions:

```bash
chmod 600 /home/bhub/bhub-api/.env.staging
```

---

## 10. Run the App with PM2

Still as the `bhub` user:

```bash
cd /home/bhub/bhub-api
NODE_ENV=staging pm2 start dist/main.js --name bhub-api-uat --time
pm2 save
```

Make PM2 auto-start at boot (run as root):

```bash
exit   # leave the bhub shell
pm2 startup systemd -u bhub --hp /home/bhub
# copy and run the command it prints
```

Check status:

```bash
pm2 status
pm2 logs bhub-api-uat --lines 100
```

Test the app:

```bash
curl -i http://127.0.0.1:4000/health
```

You should see `HTTP/1.1 200 OK`.

---

## 11. Add Nginx Reverse Proxy (Optional but Recommended)

Install Nginx:

```bash
apt install -y nginx
```

Create `/etc/nginx/sites-available/bhub-api-uat`:

```nginx
server {
    listen 80;
    server_name uat-api.bhub.local;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support for /console and /real-time
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/bhub-api-uat /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Add TLS with Let's Encrypt (if the domain is public)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d uat-api.bhub.local
```

---

## 12. Firewall Rules

Allow only SSH and HTTP/HTTPS:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

---

## 13. Verify the UAT Installation

Run these checks:

```bash
# 1. App is running
pm2 status

# 2. External MongoDB reachable
nc -zv 172.17.10.10 27017
mongosh "mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017/bhub_uat?authSource=bhub_uat" \
  --eval "db.runCommand({ ping: 1 })"

# 3. External Redis reachable
nc -zv 172.17.10.10 6379
redis-cli -h 172.17.10.10 -p 6379 -a CHANGE_ME_REDIS ping

# 4. HTTP works
curl -i http://uat-api.bhub.local/health

# 5. Socket.IO /console namespace reachable
curl -i "http://uat-api.bhub.local/socket.io/?EIO=4&transport=polling"
```

All four should succeed.

---

## 14. Daily Operations

**View logs:**

```bash
pm2 logs bhub-api-uat --lines 200
```

**Restart after deploy:**

```bash
cd /home/bhub/bhub-api
git pull
pnpm install --frozen-lockfile
pnpm run build
pm2 restart bhub-api-uat --update-env
```

**Stop the app:**

```bash
pm2 stop bhub-api-uat
```

**MongoDB backup (daily cron):**

> Backups should ideally run on the Mongo host itself. If you must run from the LXC:

```bash
mongodump --uri="mongodb://bhub_app:CHANGE_ME_APP@172.17.10.10:27017/bhub_uat?authSource=bhub_uat" \
  --out=/var/backups/mongo/$(date +%F)
```

---

## 15. Troubleshooting

| Problem | Check |
|---|---|
| App crashes on startup | `pm2 logs bhub-api-uat` — usually a missing env var. Joi prints the failing key. |
| `MongoServerError: Authentication failed` | User/password wrong, or `authSource` missing in `MONGO_URI`. |
| `MongoNetworkError: connect ETIMEDOUT 172.17.10.10:27017` | LXC cannot reach the Mongo host. Check Proxmox bridge, firewall on `172.17.10.10`, and `nc -zv 172.17.10.10 27017`. |
| `MongoServerSelectionError` | Mongo is reachable but not ready, or `replicaSet` / `tls` options mismatch the server config. |
| `NOAUTH Authentication required` (Redis) | Missing password in `REDIS_URL`. |
| `Error: connect ECONNREFUSED 172.17.10.10:6379` | Redis host is down or firewall blocks the LXC IP. Check `nc -zv 172.17.10.10 6379`. |
| `WRONGPASS invalid username-password` | Password wrong, or ACL user not allowed. Confirm with the DBA. |
| `BullMQ: Error: ERR unknown command 'SUBSCRIBE'` | Redis ACL blocks pub/sub — ask the DBA to allow `+@pubsub` for this user. |
| WebSocket disconnects every minute | Nginx `proxy_read_timeout` too low — set to `3600s`. |
| Throttler errors in dev only | The app disables Redis throttler storage when `NODE_ENV=development`. For UAT use `staging`. |
| `/console` bridge cannot connect | Check that the Go bridge uses the JOSE membership token, not a JWT. |
| `413 Payload Too Large` on `/retailer` | The `/retailer` endpoint has a 1 MB limit by design. Other endpoints are 64 KB. |

---

## 16. Security Checklist Before UAT Sign-off

- [ ] All `CHANGE_ME_*` passwords replaced with strong secrets
- [ ] `.env.staging` is `chmod 600` and owned by `bhub`
- [ ] Database server (`172.17.10.10`) only allows connections from the UAT LXC IP for ports `27017` and `6379` (firewall rule on the DB host)
- [ ] MongoDB uses authentication, and the UAT user has `readWrite` on `bhub_uat` only (not `root`)
- [ ] Redis has `requirepass` (or ACL user) set, and is reachable only from allowed IPs
- [ ] If Redis is shared with other apps, UAT uses a dedicated DB index or ACL user to avoid key collisions
- [ ] UFW firewall enabled
- [ ] TLS enabled on Nginx (if public)
- [ ] Backups scheduled (daily mongodump)
- [ ] `pm2 save` and `pm2 startup` done — app survives reboot
- [ ] Test one full user flow: signup → login → `/me`

---

## 17. Rollback

If UAT fails:

```bash
cd /home/bhub/bhub-api
git log --oneline -5
git checkout <previous-commit-sha>
pnpm install --frozen-lockfile
pnpm run build
pm2 restart bhub-api-uat --update-env
```

Mongo data rollback (run from a host with admin credentials):

```bash
mongorestore --drop --uri="mongodb://bhub_admin:CHANGE_ME_STRONG@172.17.10.10:27017/?authSource=admin" \
  /var/backups/mongo/YYYY-MM-DD
```

---

**Done.** The bhub-api backend should now be running on `https://uat-api.bhub.local` and ready for UAT testing.
