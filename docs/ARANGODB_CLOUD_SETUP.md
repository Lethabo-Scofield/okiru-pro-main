# ArangoDB Cloud Setup Guide

This guide helps you set up ArangoDB without Docker Desktop (for slow devices).

## Option 1: ArangoDB Oasis (Recommended - Free Tier Available)

ArangoDB Oasis is the managed cloud service by ArangoDB. They offer a free tier for development.

### Step 1: Sign Up

1. Go to https://cloud.arangodb.com/
2. Click "Sign Up" and create an account
3. Verify your email

### Step 2: Create a Deployment

1. Click "New Deployment"
2. Select "Free Tier" (or paid if you need more resources)
3. Choose region (pick closest to your users - for South Africa, use Europe)
4. Set deployment name: `okiru-bbbee`
5. Choose version: latest stable
6. Click "Create"

### Step 3: Get Connection Details

1. Wait for deployment to be ready (2-3 minutes)
2. Click on your deployment
3. Go to "Overview" tab
4. Note down:
   - **Endpoint URL**: e.g., `https://okiru-bbbee.arangodb.cloud:8529`
   - **Database**: `_system` (or create `bbbee_db`)
   - **Root Password**: Click "Show Root Password"

### Step 4: Configure Environment

Edit `apps/api/.env`:

```env
# Comment out local settings
# ARANGO_URL=http://127.0.0.1:8529

# Use Oasis cloud settings
ARANGO_URL=https://okiru-bbbee.arangodb.cloud:8529
ARANGO_DB=bbbee_db
ARANGO_USER=root
ARANGO_PASSWORD=<your-root-password>
```

### Step 5: Restart API Server

```bash
cd apps/api
npm run dev
```

Check health endpoint: `http://localhost:3000/api/health`

## Option 2: ArangoDB on AWS/GCP/Azure

If you prefer major cloud providers:

### AWS Marketplace

1. Go to AWS Marketplace: https://aws.amazon.com/marketplace
2. Search "ArangoDB"
3. Select ArangoDB Oasis or ArangoDB Enterprise
4. Launch instance (t3.micro for testing ~$20/month)
5. Configure security group to allow port 8529
6. Note connection details

### Google Cloud Platform

1. Go to GCP Marketplace
2. Search "ArangoDB"
3. Deploy ArangoDB Kubernetes operator or VM instance
4. Configure firewall to allow port 8529

### Microsoft Azure

1. Go to Azure Marketplace
2. Search "ArangoDB"
3. Create ArangoDB resource
4. Configure networking to allow port 8529

## Option 3: Alternative Local Setup (No Docker)

If you want to run locally without Docker:

### Windows

1. Download ArangoDB installer: https://www.arangodb.com/download-major/windows/
2. Run installer
3. Select "Single Instance"
4. Set root password during installation
5. ArangoDB will run as Windows service

### macOS

```bash
brew install arangodb
arangod
```

### Linux

```bash
# Ubuntu/Debian
curl -OL https://download.arangodb.com/arangodb312/DEB/Release.key
sudo apt-key add Release.key
echo 'deb https://download.arangodb.com/arangodb312/DEB/ /' | sudo tee /etc/apt/sources.list.d/arangodb.list
sudo apt update
sudo apt install arangodb3
sudo systemctl start arangodb3
```

## Verify Connection

Test your ArangoDB connection:

```bash
# Using curl
curl -u root:<password> http://<your-url>:8529/_api/version

# Or check API health
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "ok": true,
  "arangodb": {
    "ok": true,
    "version": "3.12.0"
  }
}
```

## Troubleshooting

### SSL Certificate Issues

If you get SSL errors with Oasis:

```env
ARANGO_VERIFY_SSL=true
```

For local development with self-signed certs:

```env
ARANGO_VERIFY_SSL=false
```

### Connection Refused

1. Check if ArangoDB is running: `curl http://<url>:8529/_api/version`
2. Verify firewall rules allow port 8529
3. Check if credentials are correct

### Slow Performance

For slow devices, consider:
- ArangoDB Oasis free tier (no local resources needed)
- AWS t3.micro (2 vCPU, 1GB RAM)
- GCP e2-micro (free tier eligible)

## Security Best Practices

1. **Never commit credentials** - Use `.env` files (already in .gitignore)
2. **Use strong passwords** - Root password should be complex
3. **Restrict access** - Configure IP allowlists in Oasis dashboard
4. **Enable SSL** - Always use HTTPS for cloud deployments
5. **Rotate credentials** - Change passwords periodically

## Next Steps

After ArangoDB is connected:

1. Run toolkit ingestion: `node scripts/ingest-toolkits.js`
2. Verify templates are stored: `GET /api/templates`
3. Test Lake Trading validation: `POST /api/templates/{id}/compare`

## Free Tier Limits (ArangoDB Oasis)

- 1 deployment
- 1 GB storage
- Shared resources
- Suitable for development/testing

For production, upgrade to paid tier ($0.20/hour for small instance).
