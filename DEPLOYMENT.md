# Server Deployment Guide

This guide covers two options for making your PaYa API server publicly accessible:

1. **Quick Testing** - ngrok tunnel (temporary, for testing)
2. **Production** - Railway or Render (permanent deployment)

---

## Option 1: Quick Testing with ngrok ⚡

Perfect for quickly testing your mobile app with a public URL.

### Steps:

1. **Install ngrok:**
   ```bash
   # Download from https://ngrok.com/download
   # Or via npm:
   npm install -g ngrok
   ```

2. **Start your local server:**
   ```bash
   cd M:/Projects/OpenPay/server
   pnpm dev
   # Server should be running on http://localhost:3000
   ```

3. **Start ngrok tunnel:**
   ```bash
   ngrok http 3000
   ```

4. **Copy the HTTPS URL** (looks like `https://abc123.ngrok-free.app`)

5. **Update mobile app temporarily:**
   Edit `app/mobile/src/api/client.ts`:
   ```typescript
   const API_BASE_URL = 'https://your-ngrok-url.ngrok-free.app';
   ```

**Note:** ngrok free tier URLs change every time you restart. For a permanent URL, use a paid ngrok account or deploy properly.

---

## Option 2: Deploy to Railway 🚂 (Recommended)

Railway is easy to use and includes PostgreSQL + Redis.

### Steps:

1. **Sign up at [railway.app](https://railway.app)** (GitHub login)

2. **Create a new project:**
   - Click **"New Project"**
   - Select **"Deploy from GitHub repo"** (or upload the code)

3. **Add PostgreSQL service:**
   - Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
   - Copy the `DATABASE_URL` connection string

4. **Add Redis service:**
   - Click **"+ New"** → **"Database"** → **"Add Redis"**
   - Copy the `REDIS_URL` connection string

5. **Deploy the API:**
   - Click **"+ New"** → **"GitHub Repo"** (or **"Empty Service"** if uploading)
   - Select your repository / upload code
   - Railway will auto-detect the Dockerfile

6. **Set environment variables:**
   Go to your service → **Variables** tab and add:
   ```
   DATABASE_URL=postgresql://... (from PostgreSQL service)
   REDIS_URL=redis://... (from Redis service)
   NODE_ENV=production
   PORT=3000
   
   # Auth
   JWT_ACCESS_SECRET=your-secret-here
   JWT_REFRESH_SECRET=your-refresh-secret-here
   JWT_REFRESH_EXPIRY_SECONDS=604800
   
   # Twilio (if using)
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=...
   
   # Synctera (if using)
   SYNCTERA_API_KEY=...
   
   # Plaid (if using)
   PLAID_CLIENT_ID=...
   PLAID_SECRET=...
   PLAID_ENV=sandbox
   ```

7. **Run database migrations:**
   - Go to service → **Settings** → **"Run Command"**
   - Run: `cd apps/api && pnpm db:push && pnpm db:seed`

8. **Get your public URL:**
   - Railway provides a public URL like `https://your-app.railway.app`
   - You can also add a custom domain in **Settings** → **Networking**

9. **Update mobile app:**
   Edit `app/mobile/src/api/client.ts`:
   ```typescript
   const API_BASE_URL = __DEV__
     ? Platform.OS === 'android'
       ? 'http://10.0.2.2:3000'
       : 'http://localhost:3000'
     : 'https://your-app.railway.app'; // Your Railway URL
   ```

---

## Option 3: Deploy to Render 🎨

Similar to Railway, also easy to use.

### Steps:

1. **Sign up at [render.com](https://render.com)**

2. **Create PostgreSQL database:**
   - **New +** → **PostgreSQL**
   - Copy the **Internal Database URL**

3. **Create Redis instance:**
   - **New +** → **Redis**
   - Copy the **Internal Redis URL**

4. **Deploy Web Service:**
   - **New +** → **Web Service**
   - Connect your GitHub repo or upload code
   - **Settings:**
     - **Build Command:** `cd server && pnpm install && cd apps/api && pnpm db:generate && cd ../.. && pnpm build`
     - **Start Command:** `cd server/apps/api && node dist/index.js`
     - **Environment:** `Node`
     - **Docker:** Use the Dockerfile instead (if you prefer)

5. **Add environment variables** (same as Railway above)

6. **Get your public URL** and update the mobile app

---

## Environment Variables Reference

Copy from `apps/api/env.example`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/paya

# Redis
REDIS_URL=redis://host:6379

# JWT
JWT_ACCESS_SECRET=change-me-to-random-string
JWT_REFRESH_SECRET=change-me-to-random-string
JWT_REFRESH_EXPIRY_SECONDS=604800

# Server
PORT=3000
NODE_ENV=production

# CORS (for mobile app)
CORS_ORIGIN=https://paya.cash

# Twilio SMS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...

# Synctera
SYNCTERA_API_KEY=...
SYNCTERA_BASE_URL=https://api.synctera.com/v1

# Plaid
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox

# Mobile app deep links
MOBILE_APP_DEEPLINK_BASE_URL=https://paya.cash
```

---

## Quick Testing Setup (5 minutes)

For the fastest way to test remotely:

```bash
# Terminal 1: Start server
cd M:/Projects/OpenPay/server
pnpm dev

# Terminal 2: Start ngrok
ngrok http 3000

# Copy the HTTPS URL and update mobile app temporarily
```

Then rebuild your mobile app with the ngrok URL!

---

## Troubleshooting

### Database connection errors:
- Make sure `DATABASE_URL` uses the **Internal URL** (if services are on same platform)
- Or use the **External URL** if connecting from outside

### CORS errors:
- Add your mobile app URL to `CORS_ORIGIN` in environment variables
- Or set `CORS_ORIGIN=*` for testing (not recommended for production)

### Build fails:
- Make sure all dependencies are in `package.json`
- Check that Dockerfile paths match your project structure

### Redis connection:
- Use the internal Redis URL provided by your platform
- Make sure Redis is running before starting the API

---

## Production Checklist

- [ ] Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Use production database (not local)
- [ ] Configure CORS properly
- [ ] Set up custom domain
- [ ] Enable HTTPS (usually automatic)
- [ ] Set up monitoring/logging
- [ ] Configure backups for database
- [ ] Update mobile app with production URL

