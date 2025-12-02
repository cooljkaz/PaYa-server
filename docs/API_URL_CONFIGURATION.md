# API URL Configuration Guide

This guide explains how to configure the API URL for the mobile app and dashboard.

## Current Setup

**AWS Staging API URL:**
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com
```

## Mobile App Configuration

The mobile app uses a flexible configuration system:

### 1. Via `app.json` (Recommended)

The API URL is configured in `app/mobile/app.json`:

```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com"
    }
  }
}
```

**To use localhost for development:**
```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://localhost:3000"
    }
  }
}
```

### 2. Automatic Fallback

If `apiUrl` is not set in `app.json`, the app will:
- **Development (`__DEV__ = true`):**
  - Android: `http://10.0.2.2:3000` (Android emulator workaround)
  - iOS: `http://localhost:3000`
- **Production (`__DEV__ = false`):**
  - Uses AWS staging URL: `http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com`

### 3. Code Location

The API client is in `app/mobile/src/api/client.ts`:
- Uses `expo-constants` to read `app.json` config
- Falls back to environment-based defaults

## Dashboard Configuration

The dashboard is served at `/public/dashboard.html` and can be accessed at:
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/public/dashboard.html
```

### URL Parameter Override

You can override the API URL using a query parameter:
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/public/dashboard.html?api=http://localhost:3000
```

### Default Behavior

- **Default:** Uses AWS staging URL
- **With `?api=` parameter:** Uses the specified URL

### WebSocket Connection

The WebSocket connection automatically uses the same API URL (converts `http://` to `ws://`).

## Environment-Specific URLs

### Development (Local)
```
http://localhost:3000
```

### Staging (AWS)
```
http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com
```

### Production (Future)
```
https://api.paya.cash
```

## Updating the API URL

### For Mobile App

1. **Update `app.json`:**
   ```json
   {
     "expo": {
       "extra": {
         "apiUrl": "YOUR_NEW_URL"
       }
     }
   }
   ```

2. **Rebuild the app:**
   ```bash
   cd app/mobile
   npx expo start --clear
   ```

### For Dashboard

1. **Edit `server/apps/api/public/dashboard.html`:**
   ```javascript
   const API_BASE = 'YOUR_NEW_URL';
   ```

2. **Or use URL parameter:**
   ```
   /public/dashboard.html?api=YOUR_NEW_URL
   ```

## Testing

### Test Mobile App Connection

1. Update `app.json` with the API URL
2. Start the app: `npx expo start`
3. Check network requests in the Expo DevTools

### Test Dashboard Connection

1. Open: `http://PaYaSt-Farga-jjKXua2NM2Df-1359529141.us-east-1.elb.amazonaws.com/public/dashboard.html`
2. Check browser console for connection status
3. Try the URL parameter override: `?api=http://localhost:3000`

## Notes

- The AWS load balancer URL is temporary and will change if the stack is recreated
- For production, set up a custom domain (e.g., `api.paya.cash`) and update DNS
- The mobile app's `app.json` config takes precedence over code defaults
- The dashboard's URL parameter override is useful for local development




