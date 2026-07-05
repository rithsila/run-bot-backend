# Deploying run-bot-api (Run Bot backend)

This guide explains how to host the **run-bot-api** NestJS backend on **Render.com** and its **MongoDB database** on **MongoDB Atlas** completely for free.

run-bot-api is the slimmed Run Bot backend. It handles **telemetry and commands** for the MT5 bot. It does **not** check licenses and does **not** store user accounts. It only trusts short-lived tokens signed by SafetyScore.

Because run-bot-api uses **Socket.IO** for real-time telemetry and commands, it requires a host that supports persistent WebSocket connections. Serverless platforms (like Vercel or Supabase Edge Functions) will **not** work. We must use a Platform-as-a-Service (PaaS) that runs long-lived containerized processes.

---

## 1. Set Up MongoDB Atlas (M0 Free Tier)

MongoDB Atlas is the official database-as-a-service from the creators of MongoDB. Its free tier is highly reliable and stays free forever without requiring a credit card.

### Steps to Set Up:
1. **Sign Up:** Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2. **Create a Cluster:**
   - Choose the **M0 (Free)** tier.
   - Select a provider (AWS, Google Cloud, or Azure) and a region close to your target audience.
   - Click **Create**.
3. **Database Security (Network Access):**
   - Go to **Network Access** in the left menu.
   - Click **Add IP Address**.
   - Select **Allow Access from Anywhere** (`0.0.0.0/0`) because free-tier hosts like Render use dynamic IP addresses that change frequently.
4. **Database Access (User):**
   - Go to **Database Access** in the left menu.
   - Click **Add New Database User**.
   - Choose **Password** authentication.
   - Create a username (e.g., `run_bot_user`) and a secure password. Make sure the role is set to `Read and write to any database`.
5. **Get the Connection URI:**
   - Go to **Database / Clusters**.
   - Click the **Connect** button on your database cluster.
   - Select **Drivers** under "Connect to your application".
   - Copy the connection string (URI). It will look like this:
     ```
     mongodb+srv://run_bot_user:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
     ```
   - Replace `<password>` with the password you created for your database user, and append the database name (e.g., `run-bot`) before the query parameters:
     ```
     mongodb+srv://run_bot_user:MySecurePassword@cluster0.xxxx.mongodb.net/run-bot?retryWrites=true&w=majority&appName=Cluster0
     ```

---

## 2. Deploy Backend on Render.com

Render offers a free Web Service tier. It integrates directly with GitHub or GitLab, and can deploy from the existing `Dockerfile` in the project.

- **Resources:** 512MB RAM, shared CPU.
- **WebSockets:** Fully supported.
- **Spin-down Caveat:** Free tier services automatically spin down (sleep) after 15 minutes of inactivity. When a client connects to a sleeping service, it triggers a "cold start" delay of 30+ seconds. We will resolve this in Section 3 using a keep-alive monitor.

### Deployment Steps:
1. Push your `run-bot-back` code to a repository on **GitHub** or **GitLab**.
2. Sign up at [dashboard.render.com](https://dashboard.render.com).
3. Click **New +** and select **Web Service**.
4. Connect your GitHub/GitLab repository.
5. Configure the service:
   - **Name:** `run-bot-api`
   - **Environment:** Select **Docker** (Render will automatically detect your `Dockerfile` and build a production-pruned image using the multi-stage configuration).
   - **Region:** Choose a region close to your database cluster.
   - **Instance Type:** Select **Free**.
6. Set the **Environment Variables** (see Section 4).
7. Click **Create Web Service**. Render will build and deploy the container.

---

## 3. Keep-Alive Setup (How to Avoid Spin-Down)

To ensure your free backend on Render stays awake 24/7 (which is critical for the MT5 Go bridge to connect instantly without a 30-second cold-start delay), set up a free uptime monitor:

1. Go to [uptime.robot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org).
2. Create a free account.
3. Configure a new monitor:
   - **Monitor Type:** HTTP(s) or Web Page.
   - **URL:** `https://your-run-bot-api-url.onrender.com/health`
   - **Interval:** Every **5 minutes** (this is well within Render's 15-minute timeout).
4. This request returns `{"status":"ok"}` from the health check endpoint and keeps the server container hot and running 24/7 for free.

---

## 4. Environment Variables Setup

When creating your service on Render, navigate to the **Environment** section and add the following variables:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Sets NestJS to production mode (reduces logging overhead). |
| `PORT` | `4000` | The port the container runs on inside Render. Render will bind this. |
| `FRONTEND_URL` | `https://easafetyscore.com` | **CORS Allowlist:** Set this to your live SafetyScore website URL. |
| `MONGO_URI` | `mongodb+srv://run_bot_user:MySecurePassword@cluster0.xxxx.mongodb.net/run-bot?retryWrites=true&w=majority` | Your MongoDB Atlas connection string. |
| `SAFETYSCORE_TOKEN_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----` | The ES256 **public key** (PEM format) generated in your SafetyScore setup. |

> [!NOTE]
> If the hosting provider's UI struggles with multi-line keys, you can base64-encode the PEM key and paste it as a single line, as the config validation supports base64-encoded PEM public keys natively.

---

## 5. Connecting the Web App

Once your `run-bot-api` is deployed and live (e.g., at `https://run-bot-api.onrender.com`):
1. In your **SafetyScore** frontend configuration (such as Vercel project settings), update the environment variable:
   ```env
   NEXT_PUBLIC_BHUB_API_URL=https://run-bot-api.onrender.com
   ```
2. Redeploy the SafetyScore web app so it can connect to the new live backend.
