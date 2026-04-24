# GitHub Secrets Setup

## 🔑 Secrets to Add

Go to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

Add these 5 secrets:

### 1. AZURE_CLIENT_ID
```
7e45d2cd-846f-44f7-916e-aa1b9ae15b62
```

### 2. AZURE_CLIENT_SECRET
```
[GET FROM AZURE PORTAL OR RE-RUN SP CREATION]
```

### 3. AZURE_SUBSCRIPTION_ID
```
cfc3d77c-3695-4370-b976-dffe20d784c1
```

### 4. AZURE_TENANT_ID
```
84a01643-6d6b-4465-8744-7023db40d45f
```

### 5. VITE_API_URL
```
https://okiru.20.164.101.114.nip.io
```

---

## ⚠️ Important: Assign Azure Permissions

The service principal needs permission to access your Azure resources. Run these commands:

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription cfc3d77c-3695-4370-b976-dffe20d784c1

# Assign Contributor role to resource group
az role assignment create \
  --assignee 7e45d2cd-846f-44f7-916e-aa1b9ae15b62 \
  --role Contributor \
  --resource-group okiru-pro-rg

# Assign AcrPush role for container registry
az role assignment create \
  --assignee 7e45d2cd-846f-44f7-916e-aa1b9ae15b62 \
  --role AcrPush \
  --scope /subscriptions/cfc3d77c-3695-4370-b976-dffe20d784c1/resourceGroups/okiru-pro-rg/providers/Microsoft.ContainerRegistry/registries/okiruproacrde4d539b
```

---

## ✅ Verify Setup

After adding secrets and assigning permissions, test with:

```bash
# Go to GitHub → Actions → "Build and Deploy to AKS"
# Click "Run workflow" → "Run workflow"
```

Or push to main:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

---

## 🔒 Security Notes

- **Never commit these secrets to your code**
- The service principal password is valid for 1 year
- Rotate credentials periodically
- The service principal has Contributor access to the okiru-pro-rg resource group only

## 🆘 Troubleshooting

If deployment fails with "Insufficient permissions", run the Azure CLI commands above to assign roles.
