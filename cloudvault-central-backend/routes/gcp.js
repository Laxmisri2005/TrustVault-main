const express = require('express');
const router = express.Router();
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const crypto = require('crypto');
const { requirePermission } = require('../middleware/auth');
const { appendLog } = require('../utils/audit');
const { raisePrivacyAlert } = require('../utils/privacyAlerts');
const { sendSecurityAlert } = require('../utils/alertMailer');

function maskValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(0, s.length - 4)) + s.slice(-2);
}

function getProjectId() {
  return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
}

function getClient() {
  const projectId = getProjectId();
  if (!projectId) return { projectId: '', client: null };
  try {
    return { projectId, client: new SecretManagerServiceClient() };
  } catch (err) {
    console.error('GCP client init error', err);
    return { projectId, client: null };
  }
}

function secretPath(projectId, name) {
  return `projects/${projectId}/secrets/${name}`;
}

function formatGcpTime(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const seconds = Number(value.seconds || 0);
  const nanos = Number(value.nanos || 0);
  if (!seconds) return null;
  return new Date((seconds * 1000) + Math.floor(nanos / 1000000)).toISOString();
}

function isAdminUser(req) {
  return req.user?.role === 'Admin' || !!req.user?.permissions?.canDelete;
}

function canCreateSecret(req) {
  return !!req.user?.permissions?.canView || req.user?.role === 'Admin' || !!req.user?.permissions?.canRotate;
}

function toGcpLabelValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function generatePassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function getSecretLabels(secret) {
  return secret?.labels || {};
}

function extractOwnerEmails(secret) {
  const labels = getSecretLabels(secret);
  const emails = [];
  const ownerIds = [];
  for (const [key, rawValue] of Object.entries(labels)) {
    const lowerKey = String(key || '').toLowerCase();
    const value = String(rawValue || '').trim();
    if (!value) continue;

    const isEmailLikeKey = lowerKey.includes('email') || lowerKey.includes('mail') || lowerKey.includes('notify');
    const isOwnerLikeKey = ['owner', 'createdby', 'created_by', 'username', 'user'].includes(lowerKey);
    if (!isEmailLikeKey && !isOwnerLikeKey) continue;

    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const email of matches) emails.push(email.trim());
    if (!matches.length && isOwnerLikeKey) ownerIds.push(value);
  }

  const fallbackDomain = String(process.env.OWNER_EMAIL_DOMAIN || '').trim().replace(/^@+/, '');
  if (fallbackDomain) {
    for (const ownerId of ownerIds) {
      if (ownerId.includes('@')) continue;
      emails.push(`${ownerId}@${fallbackDomain}`);
    }
  }

  return Array.from(new Set(emails));
}

function extractOwnerTopicArns(secret) {
  const labels = getSecretLabels(secret);
  const topics = [];
  for (const [key, rawValue] of Object.entries(labels)) {
    const lowerKey = String(key || '').toLowerCase();
    if (!lowerKey.includes('snstopic') && !lowerKey.includes('topicarn') && !lowerKey.includes('alerttopic')) continue;
    const value = String(rawValue || '').trim();
    if (!value) continue;
    const parts = value.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.startsWith('arn:aws:sns:')) topics.push(part);
    }
  }
  return Array.from(new Set(topics));
}

function extractOwnerPhones(secret) {
  const labels = getSecretLabels(secret);
  const phones = [];
  for (const [key, rawValue] of Object.entries(labels)) {
    const lowerKey = String(key || '').toLowerCase();
    const isPhoneKey = lowerKey.includes('phone') || lowerKey.includes('sms') || lowerKey.includes('mobile');
    if (!isPhoneKey) continue;
    const value = String(rawValue || '').trim();
    if (!value) continue;
    const parts = value.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (/^\+?[1-9]\d{7,14}$/.test(part)) phones.push(part);
    }
  }
  return Array.from(new Set(phones));
}

function reqMeta(req) {
  return {
    path: req.path,
    method: req.method,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  };
}

async function notifyOwnerOnUnauthorized(secretName, secretMeta, req, operation) {
  const recipients = extractOwnerEmails(secretMeta);
  const topicArns = extractOwnerTopicArns(secretMeta);
  const phoneNumbers = extractOwnerPhones(secretMeta);
  const delivery = await sendSecurityAlert({
    action: 'privacy_leakage_attempt',
    user: req.user?.user || 'unknown',
    role: req.user?.role || 'unknown',
    provider: 'gcp',
    secret: secretName,
    error: `Unauthorized ${operation} attempt on secret ${secretName}`,
    detail: `Owner notification for ${secretName}`,
    force: true,
    recipients,
    topicArns,
    phoneNumbers,
    ...reqMeta(req)
  }).catch((err) => ({
    sent: false,
    reason: `send_failed:${err?.message || 'unknown'}`,
    recipients,
    topicArns,
    phoneNumbers
  }));

  appendLog({
    user: req.user?.user || 'anon',
    role: req.user?.role || 'unknown',
    action: `owner_alert_${operation}`,
    provider: 'gcp',
    secret: secretName,
    ownerRecipients: delivery?.recipients || recipients,
    ownerTopics: delivery?.topicArns || topicArns,
    ownerPhones: delivery?.phoneNumbers || phoneNumbers,
    notificationStatus: delivery?.reason || 'unknown',
    notificationSent: !!delivery?.sent
  });
}

function isOwnedByUser(secret, userName) {
  if (!secret || !userName) return false;
  const uname = String(userName).trim().toLowerCase();
  if (!uname) return false;

  const labels = getSecretLabels(secret);
  const ownerValue = [
    labels.owner,
    labels.username,
    labels.user,
    labels.createdby,
    labels.created_by
  ].find(Boolean);

  if (ownerValue && String(ownerValue).trim().toLowerCase() === uname) {
    return true;
  }

  const secretName = String(secret.name || '').split('/').pop().toLowerCase();
  return secretName.startsWith(`${uname}-`) || secretName.startsWith(`${uname}_`) || secretName.includes(`-${uname}-`);
}

router.get('/secrets', requirePermission('canView'), async (req, res) => {
  const { projectId, client } = getClient();
  if (!client || !projectId) {
    return res.status(500).json({
      ok: false,
      error: 'GCP Secret Manager not configured',
      details: 'Set GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT and restart the backend'
    });
  }

  try {
    const [secrets] = await client.listSecrets({ parent: `projects/${projectId}` });
    const scoped = isAdminUser(req) ? secrets : secrets.filter((s) => isOwnedByUser(s, req.user?.user));
    const out = scoped.map((s) => ({
      name: s.name.split('/').pop(),
      createdOn: formatGcpTime(s.createTime),
      labels: getSecretLabels(s)
    }));

    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'list_secrets',
      provider: 'gcp',
      scopedCount: out.length
    });
    res.json({ ok: true, secrets: out });
  } catch (err) {
    console.error('GCP list error', err);
    res.status(500).json({
      ok: false,
      error: err.message,
      details: 'Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid service-account JSON with Secret Manager access'
    });
  }
});

router.get('/secret/:name', requirePermission('canView'), async (req, res) => {
  const { projectId, client } = getClient();
  if (!client || !projectId) {
    return res.status(500).json({
      ok: false,
      error: 'GCP Secret Manager not configured',
      details: 'Set GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT and restart the backend'
    });
  }

  const name = req.params.name;
  try {
    let secret = null;
    if (!isAdminUser(req)) {
      [secret] = await client.getSecret({ name: secretPath(projectId, name) });
      if (!isOwnedByUser(secret, req.user?.user)) {
        raisePrivacyAlert({
          action: 'secret_owner_mismatch',
          user: req.user?.user || 'unknown',
          role: req.user?.role || 'unknown',
          path: req.path,
          detail: `attempted read of ${name}`,
          severity: 'high'
        });
        appendLog({
          user: req.user?.user || 'anon',
          role: req.user?.role || 'unknown',
          action: 'unauthorized_secret_read',
          provider: 'gcp',
          secret: name,
          reason: 'owner_mismatch'
        });
        await notifyOwnerOnUnauthorized(name, secret, req, 'read');
        return res.status(403).json({ ok: false, error: 'forbidden: you can only view your own secrets' });
      }
    }

    const [version] = await client.accessSecretVersion({
      name: `${secretPath(projectId, name)}/versions/latest`
    });

    const value = version.payload?.data?.toString('utf8') || '';
    const revealed = req.user?.role === 'Admin' || (!!secret && isOwnedByUser(secret, req.user?.user));
    const display = revealed ? value : maskValue(value);

    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'get_secret',
      provider: 'gcp',
      secret: name,
      revealed
    });

    res.json({ ok: true, name, value: display, rawAllowed: revealed });
  } catch (err) {
    console.error('GCP get error', err);
    res.status(500).json({
      ok: false,
      error: err.message,
      details: 'Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid service-account JSON with Secret Manager access'
    });
  }
});

router.post('/secrets', requirePermission('canView'), async (req, res) => {
  const { projectId, client } = getClient();
  if (!client || !projectId) {
    return res.status(500).json({
      ok: false,
      error: 'GCP Secret Manager not configured',
      details: 'Set GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT and restart the backend'
    });
  }

  if (!canCreateSecret(req)) {
    raisePrivacyAlert({
      action: 'forbidden_create',
      user: req.user?.user || 'unknown',
      role: req.user?.role || 'unknown',
      path: req.path,
      detail: 'missing create permission',
      severity: 'high'
    });
    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'unauthorized_create',
      provider: 'gcp',
      reason: 'missing_permission'
    });
    return res.status(403).json({ ok: false, error: 'forbidden: missing create permission' });
  }

  const name = String(req.body?.name || '').trim();
  const value = String(req.body?.value || '');

  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).json({
      ok: false,
      error: 'invalid secret name',
      details: 'Use only letters, numbers, hyphens, and underscores'
    });
  }

  if (!value) {
    return res.status(400).json({ ok: false, error: 'secret value is required' });
  }

  const owner = toGcpLabelValue(req.user?.user || 'unknown');
  const labels = owner ? { owner, createdby: owner } : undefined;

  try {
    await client.createSecret({
      parent: `projects/${projectId}`,
      secretId: name,
      secret: {
        replication: { automatic: {} },
        ...(labels ? { labels } : {})
      }
    });

    await client.addSecretVersion({
      parent: secretPath(projectId, name),
      payload: {
        data: Buffer.from(value, 'utf8')
      }
    });

    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'create_secret',
      provider: 'gcp',
      secret: name
    });

    return res.json({ ok: true, message: `Created GCP secret ${name}` });
  } catch (err) {
    console.error('GCP create error', err);
    const code = Number(err?.code);
    if (code === 6) {
      return res.status(409).json({ ok: false, error: 'secret already exists' });
    }
    return res.status(500).json({
      ok: false,
      error: err.message,
      details: 'Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid service-account JSON with Secret Manager access'
    });
  }
});

router.post('/rotate/:name', requirePermission('canView'), async (req, res) => {
  const { projectId, client } = getClient();
  if (!client || !projectId) {
    return res.status(500).json({
      ok: false,
      error: 'GCP Secret Manager not configured',
      details: 'Set GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT and restart the backend'
    });
  }

  const name = req.params.name;
  if (!isAdminUser(req)) {
    try {
      const [secret] = await client.getSecret({ name: secretPath(projectId, name) });
      if (!isOwnedByUser(secret, req.user?.user)) {
        raisePrivacyAlert({
          action: 'secret_owner_mismatch',
          user: req.user?.user || 'unknown',
          role: req.user?.role || 'unknown',
          path: req.path,
          detail: `attempted rotate of ${name}`,
          severity: 'high'
        });
        appendLog({
          user: req.user?.user || 'anon',
          role: req.user?.role || 'unknown',
          action: 'unauthorized_rotate',
          provider: 'gcp',
          secret: name,
          reason: 'owner_mismatch'
        });
        await notifyOwnerOnUnauthorized(name, secret, req, 'rotation');
        return res.status(403).json({ ok: false, error: 'forbidden: you can only rotate your own secrets' });
      }
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'failed to verify secret ownership', details: err.message });
    }
  }

  if (!req.user?.permissions?.canRotate && req.user?.role !== 'Admin') {
    let secret = null;
    try {
      [secret] = await client.getSecret({ name: secretPath(projectId, name) });
    } catch (err) {
      secret = null;
    }

    if (secret && isOwnedByUser(secret, req.user?.user)) {
      // Owners can rotate their own secrets even without global rotate permission.
    } else {
      raisePrivacyAlert({
        action: 'forbidden_rotate',
        user: req.user?.user || 'unknown',
        role: req.user?.role || 'unknown',
        path: req.path,
        detail: `missing rotate permission for ${name}`,
        severity: 'high'
      });
      appendLog({
        user: req.user?.user || 'anon',
        role: req.user?.role || 'unknown',
        action: 'unauthorized_rotate',
        provider: 'gcp',
        secret: name,
        reason: 'missing_permission'
      });
      if (secret) {
        await notifyOwnerOnUnauthorized(name, secret, req, 'rotation');
      }
      return res.status(403).json({ ok: false, error: 'forbidden: missing rotate permission' });
    }
  }

  appendLog({
    user: req.user?.user || 'anon',
    role: req.user?.role || 'unknown',
    action: 'rotate_request',
    provider: 'gcp',
    secret: name
  });

  try {
    const nextValue = generatePassword();
    await client.addSecretVersion({
      parent: secretPath(projectId, name),
      payload: {
        data: Buffer.from(nextValue, 'utf8')
      }
    });

    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'rotate_generated',
      provider: 'gcp',
      secret: name,
      result: 'added_secret_version'
    });

    res.json({
      ok: true,
      message: `Secret value rotated for ${name}`
    });
  } catch (err) {
    console.error('GCP rotate error', err);
    appendLog({
      user: req.user?.user || 'anon',
      role: req.user?.role || 'unknown',
      action: 'rotate_failed',
      provider: 'gcp',
      secret: name,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: 'failed to rotate secret',
      details: err.message
    });
  }
});

module.exports = router;
