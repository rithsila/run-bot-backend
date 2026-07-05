# Deploying run-bot-api (Run Bot backend)

This guide explains how to host the **run-bot-api** NestJS backend on your own **Proxmox VE Virtual Machine or LXC Container running Ubuntu 24.04 Minimal**, connecting to your free **Cloud MongoDB (MongoDB Atlas)** and exposing it securely using a **Cloudflare Tunnel**.

Using your own Proxmox server with Cloud MongoDB ensures:
- **Zero Local DB Overhead:** The VM runs only the light NestJS container, keeping the RAM footprint extremely small.
- **Durable cloud storage:** Your database is safely managed in the cloud on MongoDB Atlas's free tier.
- **Low Latency:** Physical proximity to your home setup (sub-1ms if your MT5 bridge is on the same local network, or minimal latency if hosted regionally).
- **100% Free & Always On:** Hosted on your own hardware with no cloud provider limits or capacity issues.
- **Security:** Using a Cloudflare Tunnel means you **do not need to open any ports** on your home internet router or configure DDNS.

The stack has only one service:
- **run-bot-api** — the Node.js (NestJS) application.
- (MongoDB runs in the cloud on MongoDB Atlas free tier. No Redis and no BullMQ required).

---

## 1. Create VM or LXC on Proxmox

In your Proxmox VE web interface:
1. Download the **Ubuntu 24.04 LTS Minimal** ISO (or use the Ubuntu 24.04 LXC template).
2. Create a new VM or LXC Container with the following recommended specs:
   - **Cores:** 1 vCPU
   - **Memory:** 512 MB or 1 GB RAM (NestJS runs extremely light when the database is in the cloud)
   - **Disk:** 8 GB to 10 GB storage
   - **Network:** Connected to your default bridge (`vmbr0`) with DHCP or static local IP.
3. Install Ubuntu 24.04 Minimal, set up your username, and enable the **OpenSSH Server** during installation.

---

## 2. Install Docker and Docker Compose on Ubuntu 24.04

SSH into your Proxmox VM or open the Proxmox console:
```bash
ssh <username>@<YOUR_VM_IP>
```

Run the following commands to update the system and install Docker:
```bash
# Update package repositories
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io

# Start and enable Docker
sudo systemctl enable --now docker

# Add your user to the docker group so you don't need sudo for docker commands
sudo usermod -aG docker $USER

# Install Docker Compose (v2)
sudo apt-get install -y docker-compose-v2
```

> **Log out and log back in** to apply the docker group permissions.

---

## 3. Clone and Configure the Application

1. Clone your backend repository onto the VM:
   ```bash
   git clone https://github.com/rithsila/run-bot-backend.git
   cd run-bot-backend
   ```
2. Create the environment file:
   ```bash
   cp .env.docker.example .env
   ```
3. Edit `.env` (`nano .env`) and set your variables:
   - `PORT`: The port the app runs on (default `4000`).
   - `FRONTEND_URL`: The URL of your SafetyScore web app (e.g., `https://easafetyscore.com`).
   - `MONGO_URI`: Your MongoDB Atlas cloud database connection URI (e.g., `mongodb+srv://<username>:<password>@cluster0.eqyh7oq.mongodb.net/run-bot?retryWrites=true&w=majority`).
   - `SAFETYSCORE_TOKEN_PUBLIC_KEY`: The ES256 public key (raw PEM or base64-encoded PEM) signed by SafetyScore.

---

## 4. Run the Stack

Start the backend service using Docker Compose:
```bash
docker compose up -d --build
```

Verify that the service is running and healthy:
```bash
docker compose ps
```

Only the `run-bot-api` container runs on the VM. It connects directly to your cloud MongoDB instance.

---

## 5. Expose Securely with Cloudflare Tunnel (No Port Forwarding)

A Cloudflare Tunnel (`cloudflared`) makes an outbound connection to Cloudflare, letting you expose `run-bot-api` to the internet securely at a stable HTTPS hostname. You don't need to open any ports on your home router.

### Option A — Run `cloudflared` on the VM Host (Recommended)
This points the tunnel to the VM's loopback interface on port `4000`.

1. Install `cloudflared` on your Ubuntu VM by following the [Cloudflare Dashboard guide](https://dash.cloudflare.com) (under **Zero Trust > Networks > Tunnels**).
2. Configure the ingress in your local Cloudflare Tunnel settings or directly in the Cloudflare dashboard:
   - **Public Hostname:** `run-bot-api.yourdomain.com`
   - **Service Type:** `HTTP`
   - **URL:** `http://localhost:4000` (or `http://127.0.0.1:4000`)
3. Save and run the tunnel service on your VM.

### Option B — Run `cloudflared` as a Docker Container
You can run the tunnel as a service directly inside your `docker-compose.yml` file.

Add the service to your compose file:
```yaml
    cloudflared:
        image: cloudflare/cloudflared:latest
        restart: unless-stopped
        command: tunnel run
        environment:
            TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
        depends_on:
            run-bot-api:
                condition: service_healthy
```
In your `.env` file, add `CLOUDFLARE_TUNNEL_TOKEN=<your-token>`.
In the Cloudflare dashboard, route your public hostname to: `http://run-bot-api:4000`.

---

## 6. Connecting the Web App

Once the tunnel is active and live (e.g., at `https://run-bot-api.yourdomain.com`):
1. In your **SafetyScore** frontend configuration (such as Vercel project settings), update the environment variable:
   ```env
   NEXT_PUBLIC_BHUB_API_URL=https://run-bot-api.yourdomain.com
   ```
2. Redeploy the SafetyScore web app to connect to the new low-latency Singapore backend.
