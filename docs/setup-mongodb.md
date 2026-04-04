# Setup MongoDB & Redis on Proxmox (From Scratch)

Guide to set up a fresh MongoDB + Redis server on Proxmox for the bhub-api project.

---

## Table of Contents

1. [Create LXC Container on Proxmox](#1-create-lxc-container-on-proxmox)
2. [Install MongoDB 7.0](#2-install-mongodb-70)
3. [Configure MongoDB](#3-configure-mongodb)
4. [Create Database & User for bhub](#4-create-database--user-for-bhub)
5. [Install Redis](#5-install-redis)
6. [Configure Redis](#6-configure-redis)
7. [Firewall Rules](#7-firewall-rules)
8. [Connect from bhub-api](#8-connect-from-bhub-api)
9. [Verify Collections & Indexes](#9-verify-collections--indexes)
10. [Backup Strategy](#10-backup-strategy)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Create LXC Container on Proxmox

### Option A: LXC Container (recommended, lightweight)

In Proxmox Web UI (`https://your-proxmox-ip:8006`):

1. **Download template**: Datacenter → Storage → CT Templates → Templates → Download `ubuntu-22.04-standard`
2. **Create CT**: Click "Create CT"

| Setting  | Value                                      |
| -------- | ------------------------------------------ |
| Hostname | `bhub-db`                                  |
| Template | ubuntu-22.04-standard                      |
| Disk     | 20GB (minimum, 50GB recommended)           |
| CPU      | 2 cores                                    |
| Memory   | 2048 MB (2GB minimum, 4GB recommended)     |
| Swap     | 1024 MB                                    |
| Network  | DHCP or static IP (e.g. `192.168.1.50/24`) |
| DNS      | Use host settings                          |

3. Start the container
4. Open console or SSH in

```bash
# Update system
apt update && apt upgrade -y

# Install basics
apt install -y curl gnupg wget software-properties-common net-tools
```

### Option B: VM (if you need full isolation)

Same steps but choose "Create VM" with Ubuntu 22.04 ISO. Allocate at least 2 CPU, 4GB RAM, 50GB disk.

---

## 2. Install MongoDB 7.0

```bash
# Import MongoDB GPG key
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-7.0.gpg
chmod 644 /usr/share/keyrings/mongodb-server-7.0.gpg

# Add MongoDB repo
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install
apt update
apt install -y mongodb-org

# Start and enable
systemctl start mongod
systemctl enable mongod

# Verify it's running
systemctl status mongod
mongosh --eval "db.runCommand({ ping: 1 })"
```

Expected output: `{ ok: 1 }`

---

## 3. Configure MongoDB

### Edit config file

```bash
nano /etc/mongod.conf
```

Edit the existing blocks in `/etc/mongod.conf`. Do not add a second `storage:`, `net:`, or `security:` block.

```yaml
# Network
net:
    port: 27017
    bindIp: 0.0.0.0 # Allow remote connections (secure with firewall)

# Security (enable after creating admin user)
security:
    authorization: enabled

# Storage
storage:
    dbPath: /var/lib/mongodb

# Performance
operationProfiling:
    slowOpThresholdMs: 100
```

**Don't restart yet** - first create the admin user.

---

## 4. Create Database & User for bhub

### Step 1: Create Admin User

```bash
mongosh
```

```javascript
use admin

db.createUser({
  user: "admin",
  pwd: "BhubAdmin_2026_N5pT8xL3",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})
```

### Step 2: Create bhub Database & User

```javascript
use bhub

db.createUser({
  user: "bhub_app",
  pwd: "BhubApp_2026_Q7mK4vR2",
  roles: [
    { role: "readWrite", db: "bhub" }
  ]
})
```

Use a URL-safe password like the example above. Avoid characters like `@`, `:`, `/`, `?`, and `&` in MongoDB URI passwords.

### Step 3: Enable Auth & Restart

```bash
# Now restart with auth enabled
systemctl restart mongod
```

### Step 4: Test Login

```bash
mongosh "mongodb://bhub_app:BhubApp_2026_Q7mK4vR2@localhost:27017/bhub?authSource=bhub"
```

Should connect successfully.

### Step 5: Create Collections

Mongoose auto-creates collections on first write, but you can pre-create them:

```javascript
use bhub

// Core collections (17 total)
db.createCollection("users")
db.createCollection("emailverificationtokens")
db.createCollection("passwordresettokens")
db.createCollection("products")
db.createCollection("orders")
db.createCollection("plans")
db.createCollection("memberships")
db.createCollection("membership_ip_blacklist")
db.createCollection("referrals")
db.createCollection("subscriptions")
db.createCollection("coupons")
db.createCollection("trading_plans")
db.createCollection("analyzenews")
db.createCollection("retailers")
db.createCollection("trading_robots")
db.createCollection("indicators")
db.createCollection("web_push_subs")

// Verify
show collections
```

### Step 6: Create Indexes

Mongoose creates indexes on app start, but pre-creating them is faster:

```javascript
use bhub

// ── Users ──
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ emailCanonical: 1 }, { unique: true })
db.users.createIndex({ googleId: 1 }, { unique: true, sparse: true })
db.users.createIndex({ isBanned: 1 })

// ── Email Verification Tokens ──
db.emailverificationtokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.emailverificationtokens.createIndex({ tokenHash: 1, usedAt: 1, expiresAt: 1 })
db.emailverificationtokens.createIndex({ userId: 1, usedAt: 1, expiresAt: 1 })

// ── Password Reset Tokens ──
db.passwordresettokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.passwordresettokens.createIndex({ tokenHash: 1, usedAt: 1, expiresAt: 1 })
db.passwordresettokens.createIndex({ userId: 1, usedAt: 1, expiresAt: 1 })

// ── Orders ──
db.orders.createIndex({ user: 1, idempotencyKey: 1 }, { unique: true })
db.orders.createIndex({ user: 1, product: 1, orderedAt: 1 })
db.orders.createIndex(
  { user: 1, product: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["INIT", "UNPAID"] } } }
)

// ── Plans ──
db.plans.createIndex({ category: 1, price: 1 })
db.plans.createIndex({ title: "text", description: "text", features: "text" })

// ── Memberships ──
db.memberships.createIndex({ email: 1 }, { unique: true })
db.memberships.createIndex({ user: 1, status: 1 })
db.memberships.createIndex({ referral: 1 })

// ── Membership IP Blacklist ──
db.membership_ip_blacklist.createIndex({ ip: 1 }, { unique: true })

// ── Referrals ──
db.referrals.createIndex({ link: 1 }, { unique: true })
db.referrals.createIndex({ code: 1 }, { unique: true })

// ── Subscriptions ──
db.subscriptions.createIndex({ user: 1, product: 1 }, { unique: true })

// ── Coupons ──
db.coupons.createIndex({ code: 1 }, { unique: true })
db.coupons.createIndex({ status: 1 })

// ── Retailers ──
db.retailers.createIndex({ pair: 1, runAt: 1 }, { unique: true })
db.retailers.createIndex({ pair: 1, runAt: -1 })

// ── Indicators ──
db.indicators.createIndex({ user: 1 }, { unique: true })
db.indicators.createIndex({ user: 1, status: 1 })

// ── Web Push Subs ──
db.web_push_subs.createIndex({ userId: 1, endpoint: 1 }, { unique: true })

// Verify all indexes
db.getCollectionNames().forEach(c => {
  print("--- " + c + " ---")
  printjson(db[c].getIndexes())
})
```

---

## 5. Install Redis

```bash
# Add Redis repo
curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | \
  tee /etc/apt/sources.list.d/redis.list

# Install
apt update
apt install -y redis

# Start and enable
systemctl start redis-server
systemctl enable redis-server

# Test
redis-cli ping
```

Expected output: `PONG`

---

## 6. Configure Redis

```bash
nano /etc/redis/redis.conf
```

Change these settings:

```conf
# Allow remote connections
bind 0.0.0.0

# Set password
requirepass BhubApp_2026_Q7mK4vR2

# Memory limit (adjust based on your RAM)
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Security
protected-mode yes
```

```bash
# Restart Redis
systemctl restart redis-server

# Test with password
redis-cli -a BhubApp_2026_Q7mK4vR2 ping
```

---

## 7. Firewall Rules

Only allow connections from your app server:

```bash
# Install UFW
apt install -y ufw

# Default deny
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp

# Allow MongoDB from app server only
ufw allow from YOUR_APP_SERVER_IP to any port 27017

# Allow Redis from app server only
ufw allow from YOUR_APP_SERVER_IP to any port 6379

# If app runs on same Proxmox host, allow from host
ufw allow from 192.168.1.0/24 to any port 27017
ufw allow from 192.168.1.0/24 to any port 6379

# Enable firewall
ufw enable
ufw status
```

---

## 8. Connect from bhub-api

### Get your container IP

```bash
# Inside the LXC container
ip addr show eth0
```

Example: `192.168.1.50`

### Set environment variables

In your bhub-api `.env.development` file:

```env
# MongoDB
MONGO_URI=mongodb://bhub_app:CHANGE_THIS_APP_PASSWORD@192.168.1.50:27017/bhub

# Redis
REDIS_URL=redis://:CHANGE_THIS_REDIS_PASSWORD@192.168.1.50:6379
```

### Test connection from your Mac

```bash
# Test MongoDB (install mongosh on Mac if needed)
brew install mongosh
mongosh "mongodb://bhub_app:CHANGE_THIS_APP_PASSWORD@192.168.1.50:27017/bhub?authSource=bhub"

# Test Redis
brew install redis
redis-cli -h 192.168.1.50 -a CHANGE_THIS_REDIS_PASSWORD ping
```

### Start bhub-api

```bash
cd /Users/rithsila/Projects/bhub-api
pnpm install
pnpm run start:dev
```

The app will auto-create any missing collections and indexes on startup via Mongoose.

---

## 9. Verify Collections & Indexes

After starting the app at least once, verify in mongosh:

```bash
mongosh "mongodb://bhub_app:CHANGE_THIS_APP_PASSWORD@192.168.1.50:27017/bhub?authSource=bhub"
```

```javascript
// Check all collections exist (should be 17)
show collections

// Check document counts
db.getCollectionNames().forEach(c => {
  print(c + ": " + db[c].countDocuments() + " docs")
})

// Check indexes
db.getCollectionNames().forEach(c => {
  var indexes = db[c].getIndexes()
  print(c + ": " + indexes.length + " indexes")
})

// Check database stats
db.stats()
```

### Create First Admin User

After the app is running, sign up normally, then promote to admin:

```javascript
use bhub

db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "Admin", emailVerified: true } }
)
```

---

## 10. Backup Strategy

### Automated Daily Backup

Create a backup script:

```bash
nano /opt/backup-bhub.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mongodb"
DATE=$(date +%Y-%m-%d_%H%M)
mkdir -p $BACKUP_DIR

# MongoDB dump
mongodump \
  --uri="mongodb://bhub_app:CHANGE_THIS_APP_PASSWORD@localhost:27017/bhub" \
  --out="$BACKUP_DIR/$DATE"

# Redis dump
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/$DATE/redis-dump.rdb"

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

echo "Backup done: $BACKUP_DIR/$DATE"
```

```bash
chmod +x /opt/backup-bhub.sh

# Add to cron (daily at 2 AM)
crontab -e
```

Add this line:

```
0 2 * * * /opt/backup-bhub.sh >> /var/log/bhub-backup.log 2>&1
```

### Restore from Backup

```bash
mongorestore \
  --uri="mongodb://bhub_app:CHANGE_THIS_APP_PASSWORD@localhost:27017/bhub" \
  --drop \
  /var/backups/mongodb/2026-03-21_0200/bhub/
```

---

## 11. Troubleshooting

### MongoDB won't start

```bash
# Check logs
journalctl -u mongod --no-pager -n 50

# Check if port is in use
ss -tlnp | grep 27017

# Check data directory permissions
ls -la /var/lib/mongodb/
chown -R mongodb:mongodb /var/lib/mongodb
```

### `apt update` shows `NO_PUBKEY 160D26BB1785BA38`

This usually means the MongoDB keyring file is missing, empty, or created from the old `www.mongodb.org` URL.

```bash
rm -f /usr/share/keyrings/mongodb-server-7.0.gpg
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-7.0.gpg
chmod 644 /usr/share/keyrings/mongodb-server-7.0.gpg
apt update
```

### `mongosh` shows `Authentication failed`

Common causes:

- The password in the URI does not match the password used in `db.createUser(...)`
- The password contains special characters like `@` and was not URL-encoded
- The user was created in `bhub`, but the URI is missing `?authSource=bhub`

Example:

```bash
mongosh "mongodb://bhub_app:BhubApp_2026_Q7mK4vR2@localhost:27017/bhub?authSource=bhub"
```

### Cannot connect remotely

```bash
# Check MongoDB is listening on 0.0.0.0
ss -tlnp | grep 27017
# Should show: 0.0.0.0:27017

# Check firewall
ufw status

# Test from app server
nc -zv 192.168.1.50 27017
```

### Redis connection refused

```bash
# Check Redis is running
systemctl status redis-server

# Check bind address
grep "^bind" /etc/redis/redis.conf

# Check password
redis-cli -a CHANGE_THIS_REDIS_PASSWORD ping
```

### Mongoose connection error in app

Common errors:

| Error                    | Fix                                               |
| ------------------------ | ------------------------------------------------- |
| `ECONNREFUSED`           | Check IP, port, and firewall                      |
| `Authentication failed`  | Check username/password in MONGO_URI              |
| `not authorized on bhub` | User doesn't have readWrite role on bhub database |
| `ETIMEDOUT`              | Firewall blocking, or wrong IP address            |

### Check MongoDB memory usage

```javascript
// In mongosh
db.serverStatus().mem;
db.stats();
```

### Check Redis memory

```bash
redis-cli -a CHANGE_THIS_REDIS_PASSWORD info memory
```

---

## Quick Reference

| Service        | Port  | Default Path                  |
| -------------- | ----- | ----------------------------- |
| MongoDB        | 27017 | `/var/lib/mongodb`            |
| Redis          | 6379  | `/var/lib/redis`              |
| MongoDB config | —     | `/etc/mongod.conf`            |
| Redis config   | —     | `/etc/redis/redis.conf`       |
| MongoDB logs   | —     | `/var/log/mongodb/mongod.log` |
| Backups        | —     | `/var/backups/mongodb/`       |

### Connection Strings for .env

```env
MONGO_URI=mongodb://bhub_app:YOUR_PASSWORD@CONTAINER_IP:27017/bhub
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@CONTAINER_IP:6379
```
