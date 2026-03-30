const express = require('express');
const { SecretsManagerClient, ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { requirePermission } = require('../middleware/auth');
const { appendLog } = require('../utils/audit');

const router = express.Router();

const awsRegion = process.env.AWS_REGION || 'ap-south-1';
const awsClient = new SecretsManagerClient({ region: awsRegion });

function getProjectId() {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
}

function displayName(provider, name) {
  if (provider === 'gcp' && name === 'demo-secret') return 'GCP - demo-secret2';
  return `${provider.toUpperCase()} - ${name}`;
}

async function loadAwsOptions() {
  const out = await awsClient.send(new ListSecretsCommand({}));
  return (out.SecretList || []).map((secret) => ({
    provider: 'aws',
    name: secret.Name,
    label: displayName('aws', secret.Name)
  }));
}

async function loadGcpOptions() {
  const projectId = getProjectId();
  if (!projectId) return [];
  const client = new SecretManagerServiceClient();
  const [secrets] = await client.listSecrets({ parent: `projects/${projectId}` });
  return (secrets || []).map((secret) => {
    const name = String(secret.name || '').split('/').pop();
    return {
      provider: 'gcp',
      name,
      label: displayName('gcp', name)
    };
  });
}

router.get('/options', requirePermission('canView'), async (req, res) => {
  try {
    const [awsResult, gcpResult] = await Promise.allSettled([
      loadAwsOptions(),
      loadGcpOptions()
    ]);

    const awsOptions = awsResult.status === 'fulfilled' ? awsResult.value : [];
    const gcpOptions = gcpResult.status === 'fulfilled' ? gcpResult.value : [];
    const secrets = [...awsOptions, ...gcpOptions];

    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'list_rotation_options',
      provider: 'multi',
      scopedCount: secrets.length
    });

    res.json({ ok: true, secrets });
  } catch (err) {
    console.error('Rotation options error', err);
    res.status(500).json({ ok: false, error: 'failed to load rotation options', details: err.message });
  }
});

module.exports = router;
