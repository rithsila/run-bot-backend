# Deploying run-bot-api (Run Bot backend)

This guide explains how to host the **run-bot-api** NestJS backend and its **MongoDB database** on a dedicated **Oracle Cloud Infrastructure (OCI) Always Free VM in Singapore** using **Docker Compose** and a **Cloudflare Tunnel**.

Using an OCI Always Free VM ensures:
- **Low Latency:** Hosted in Singapore (`ap-southeast-1`), giving sub-20ms latency to Cambodia.
- **Always On:** Stays awake 24/7 with zero cold starts (unlike Render's free tier).
- **100% Free:** Does not incur any ongoing hosting costs.

The stack has just two services:
- **run-bot-api** — the Node.js (NestJS) application.
- **mongo** — the database. There is **no Redis** and **no BullMQ** required.

---

## 1. Set Up the Oracle Cloud VM

1. **Sign Up:** Create a free account at [oracle.com/cloud/free](https://www.oracle.com/cloud/free). Choose **Singapore** as your Home Region.
2. **Create a Compute Instance:**
   - Go to **Compute / Instances / Create Instance**.
   - **Image:** Select **Ubuntu** (e.g., Ubuntu 22.04 LTS or 24.04).
   - **Shape (Always Free):** Select either:
     - `VM.Standard.E2.1.Micro` (AMD, 1GB RAM)
     - `VM.Standard.A1.Flex` (ARM Ampere, up to 4 OCPUs and 24GB RAM - recommended if available).
   - **Networking:** Let it create a default Virtual Cloud Network (VCN) with a public IP.
   - **SSH Keys:** Generate/download the private SSH key so you can connect.
   - Click **Create**.
3. **Important Security Note:** You do **not** need to open port `4000` in the OCI Security List. The Cloudflare Tunnel established in Section 4 will handle ingress traffic securely, meaning your VM remains fully closed to direct public internet access.

---

## 2. Prepare the VM (Docker Installation)

SSH into your new VM using your SSH private key:
```bash
ssh -i /path/to/your-key.key ubuntu@<YOUR_VM_PUBLIC_IP>
```

Update system packages and install Docker:
```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io

# Start and enable Docker service
sudo systemctl enable --now docker

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose (v2)
sudo apt-get install -y docker-compose-v2
```

> **Log out and log back in** to apply the docker group permissions without needing `sudo`.

---

## 3. Clone and Configure the Application

1. Clone your backend repository onto the VM:
   ```bash
   git clone https://github.com/rithsila/run-bot-backend.git
   cd run-bot-backend
   ```
2. Create the environment configuration file:
   ```bash
   cp .env.docker.example .env
   ```
3. Edit `.env` (`nano .env`) and set the required variables:
   - `PORT`: The port the app runs on (default `4000`).
   - `FRONTEND_URL`: The URL of your SafetyScore web app (e.g. `https://easafetyscore.com`).
   - `SAFETYSCORE_TOKEN_PUBLIC_KEY`: The ES256 public key (raw PEM or base64-encoded PEM) signed by SafetyScore.

---

## 4. Run the Stack

Start the application and MongoDB using Docker Compose:
```bash
docker compose up -d --build
```

Verify that both services are healthy:
```bash
docker compose ps
```

The database volume `mongo-data` is mounted inside MongoDB automatically to persist your settings, audit logs, and instances. Only `run-bot-api` can access MongoDB over the private Compose network.

---

## 5. Expose Securely with Cloudflare Tunnel

A Cloudflare Tunnel (`cloudflared`) makes an outbound connection to Cloudflare and serves `run-bot-api` at a stable HTTPS hostname. Both the MT5 Go bridge and the browser connect to this hostname.

### Option A — Run `cloudflared` on the VM Host (Recommended)
This points the tunnel to the VM's loopback interface on port `4000`.

1. Install `cloudflared` on the host VM by following the [Cloudflare Dashboard guide](https://dash.cloudflare.com).
2. Configure the ingress in `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <YOUR_TUNNEL_ID>
   credentials-file: /home/ubuntu/.cloudflared/<YOUR_TUNNEL_ID>.json

   ingress:
     - hostname: run-bot-api.yourdomain.com
       service: http://127.0.0.1:4000
     - service: http_status:404
   ```
3. Run the tunnel service:
   ```bash
   sudo systemctl enable --now cloudflared
   ```

### Option B — Run `cloudflared` as a Docker Container
Add `cloudflared` directly to the `docker-compose.yml` file and point it at the `run-bot-api` container:

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
In the Cloudflare dashboard, route your public hostname to: `http://run-bot-api:4000`.

---

## 6. Connecting the Web App

Once the tunnel is active and live (e.g. at `https://run-bot-api.yourdomain.com`):
1. In your **SafetyScore** frontend configuration (such as Vercel project settings), update the environment variable:
   ```env
   NEXT_PUBLIC_BHUB_API_URL=https://run-bot-api.yourdomain.com
   ```
2. Redeploy the SafetyScore web app to connect to the new low-latency Singapore backend.
