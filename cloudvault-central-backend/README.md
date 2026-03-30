# CloudVault Central - Backend

This backend can run by itself for API development, or it can serve the built
`cloudvault-central-frontend` app in production.

## Local development

```powershell
cd cloudvault-central-backend
npm install
Copy-Item .env.example .env
```

Set the required values in `.env`, then start the API:

```powershell
npm run dev
```

For the frontend in another terminal:

```powershell
cd ..\cloudvault-central-frontend
npm install
npm run dev
```

## Production deployment

Recommended layout:

```text
repo-root/
  cloudvault-central-backend/
  cloudvault-central-frontend/
```

Build the frontend from the backend directory:

```powershell
cd cloudvault-central-backend
npm install
npm run build
npm start
```

The backend will serve static files from the first existing location below:

1. `FRONTEND_DIST_DIR`
2. `cloudvault-central-backend/dist`
3. `../cloudvault-central-frontend/dist`

## Required environment variables

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_KEY_VAULT_URL`
- `JWT_SECRET`

## Important safety notes

- Keep `.env` out of version control. This repo now ignores it by default.
- Rotate any AWS keys that have been exposed before deploying.
- Set `ALLOW_DEMO_LOGIN=false` in production.

## API endpoints

- `POST /api/auth/login`
- `GET /api/aws/secrets`
- `GET /api/aws/secret/:name`
- `POST /api/aws/rotate/:name`
- `GET /api/azure/secrets`
- `GET /api/azure/secret/:name`
- `GET /api/gcp/secrets`
- `GET /api/ping`

## Notes

- This backend reads secrets from AWS Secrets Manager, Azure Key Vault, and GCP Secret Manager.
- It masks secret values unless the authenticated role is `Admin`.
- Rotation is still a placeholder and should not be wired to live infrastructure without approval and safeguards.
