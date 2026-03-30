const express = require('express');
const router = express.Router();
const { SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand, RotateSecretCommand, DescribeSecretCommand, CreateSecretCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const crypto = require('crypto');
const { requirePermission } = require('../middleware/auth');
const { appendLog } = require('../utils/audit');
const { raisePrivacyAlert } = require('../utils/privacyAlerts');
const { sendSecurityAlert } = require('../utils/alertMailer');

const region = process.env.AWS_REGION || 'ap-south-1';
const client = new SecretsManagerClient({ region });
const ebClient = new EventBridgeClient({ region });

function maskValue(v){
  if(v==null) return '';
  const s = String(v);
  if(s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0,2) + '*'.repeat(Math.max(0, s.length-4)) + s.slice(-2);
}

function isAdminUser(req){
  return req.user?.role === 'Admin' || !!req.user?.permissions?.canDelete;
}

function canCreateSecret(req){
  return !!req.user?.permissions?.canView || req.user?.role === 'Admin' || !!req.user?.permissions?.canRotate;
}

function generatePassword(length = 20){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for(let i = 0; i < length; i += 1){
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function isOwnedByUser(secret, userName){
  if(!secret || !userName) return false;
  const uname = String(userName).trim().toLowerCase();
  if(!uname) return false;
  const tags = secret.tags || secret.Tags || [];
  const owner = (tags || []).find((t) => ['owner','username','user','createdby'].includes(String(t?.Key || '').toLowerCase()));
  if(owner?.Value && String(owner.Value).trim().toLowerCase() === uname) return true;
  const name = String(secret.name || secret.Name || '');
  return name.toLowerCase().startsWith(`${uname}/`) || name.toLowerCase().includes(`-${uname}-`);
}

function extractOwnerEmails(secret){
  const tags = secret?.tags || secret?.Tags || [];
  const emails = [];
  const ownerIds = [];
  for (const t of tags){
    const k = String(t?.Key || '').toLowerCase();
    const isEmailLikeKey = k.includes('email') || k.includes('mail') || k.includes('notify');
    const isOwnerLikeKey = ['owner', 'createdby', 'created_by', 'username', 'user'].includes(k);
    if (!isEmailLikeKey && !isOwnerLikeKey) continue;
    const value = String(t?.Value || '').trim();
    if (!value) continue;

    const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const email of matches){
      emails.push(email.trim());
    }

    if (!matches.length && isOwnerLikeKey){
      ownerIds.push(value);
    }
  }
  const fallbackDomain = String(process.env.OWNER_EMAIL_DOMAIN || '').trim().replace(/^@+/, '');
  if (fallbackDomain){
    for (const ownerId of ownerIds){
      if (ownerId.includes('@')) continue;
      emails.push(`${ownerId}@${fallbackDomain}`);
    }
  }
  return Array.from(new Set(emails));
}

function extractOwnerTopicArns(secret){
  const tags = secret?.tags || secret?.Tags || [];
  const topics = [];
  for (const t of tags){
    const key = String(t?.Key || '').toLowerCase();
    const isTopicKey = key.includes('snstopic') || key.includes('topicarn') || key.includes('alerttopic');
    if (!isTopicKey) continue;
    const value = String(t?.Value || '').trim();
    if (!value) continue;
    const parts = value.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts){
      if (part.startsWith('arn:aws:sns:')) topics.push(part);
    }
  }
  return Array.from(new Set(topics));
}

function reqMeta(req){
  return {
    path: req.path,
    method: req.method,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  };
}

async function notifyOwnerOnUnauthorized(secretName, secretMeta, req, operation){
  const recipients = extractOwnerEmails(secretMeta);
  const topicArns = extractOwnerTopicArns(secretMeta);
  const delivery = await sendSecurityAlert({
    action: 'privacy_leakage_attempt',
    user: req.user?.user || 'unknown',
    role: req.user?.role || 'unknown',
    provider: 'aws',
    secret: secretName,
    error: `Unauthorized ${operation} attempt on secret ${secretName}`,
    detail: `Owner notification for ${secretName}`,
    force: true,
    recipients,
    topicArns,
    ...reqMeta(req)
  }).catch((err) => ({
    sent: false,
    reason: `send_failed:${err?.message || 'unknown'}`,
    recipients,
    topicArns
  }));
  appendLog({
    user: req.user?.user || 'anon',
    role: req.user?.role || 'unknown',
    action: `owner_alert_${operation}`,
    provider: 'aws',
    secret: secretName,
    ownerRecipients: delivery?.recipients || recipients,
    ownerTopics: delivery?.topicArns || topicArns,
    notificationStatus: delivery?.reason || 'unknown',
    notificationSent: !!delivery?.sent
  });
}

// List secrets (basic)
router.get('/secrets', requirePermission('canView'), async (req, res) => {
  try{
    const cmd = new ListSecretsCommand({});
    const out = await client.send(cmd);
    // map minimal fields for UI
    const list = (out.SecretList || []).map(s=>({
      name: s.Name,
      arn: s.ARN,
      description: s.Description,
      lastChanged: s.LastChangedDate,
      tags: s.Tags || []
    }));
    const scoped = isAdminUser(req) ? list : list.filter((s) => isOwnedByUser(s, req.user?.user));
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'list_secrets', provider: 'aws', scopedCount: scoped.length });
    res.json({ ok:true, secrets: scoped });
  }catch(err){
    console.error('ListSecrets error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

// Get secret value (masked unless Admin)
router.get('/secret/:name', requirePermission('canView'), async (req, res) => {
  const name = req.params.name;
  try{
    let meta = null;
    if(!isAdminUser(req)){
      meta = await client.send(new DescribeSecretCommand({ SecretId: name }));
      if(!isOwnedByUser(meta, req.user?.user)){
        raisePrivacyAlert({ action: 'secret_owner_mismatch', user: req.user?.user || 'unknown', role: req.user?.role || 'unknown', path: req.path, detail: `attempted read of ${name}`, severity: 'high' });
        appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'unauthorized_secret_read', provider: 'aws', secret: name, reason: 'owner_mismatch' });
        await notifyOwnerOnUnauthorized(name, meta, req, 'read');
        return res.status(403).json({ ok:false, error: 'forbidden: you can only view your own secrets' });
      }
    }
    const cmd = new GetSecretValueCommand({ SecretId: name });
    const out = await client.send(cmd);
    let value = out.SecretString || out.SecretBinary?.toString('utf8') || '';
    const revealed = (req.user && req.user.role === 'Admin') || (!!meta && isOwnedByUser(meta, req.user?.user));
    const display = revealed ? value : maskValue(value);
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'get_secret', provider: 'aws', secret: name, revealed });
    res.json({ ok:true, name, value: display, rawAllowed: revealed ? true:false });
  }catch(err){
    console.error('GetSecret error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

router.post('/secrets', requirePermission('canView'), async (req, res) => {
  if(!canCreateSecret(req)){
    raisePrivacyAlert({ action: 'forbidden_create', user: req.user?.user || 'unknown', role: req.user?.role || 'unknown', path: req.path, detail: 'missing create permission', severity: 'high' });
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'unauthorized_create', provider: 'aws', reason: 'missing_permission' });
    return res.status(403).json({ ok:false, error: 'forbidden: missing create permission' });
  }

  const name = String(req.body?.name || '').trim();
  const value = String(req.body?.value || '');

  if(!name || !/^[A-Za-z0-9/_+=.@-]+$/.test(name)){
    return res.status(400).json({ ok:false, error: 'invalid secret name', details: 'Use letters, numbers, and / _ + = . @ -' });
  }

  if(!value){
    return res.status(400).json({ ok:false, error: 'secret value is required' });
  }

  try{
    await client.send(new CreateSecretCommand({
      Name: name,
      SecretString: value,
      Tags: [
        { Key: 'owner', Value: String(req.user?.user || 'unknown') },
        { Key: 'createdby', Value: String(req.user?.user || 'unknown') }
      ]
    }));
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'create_secret', provider: 'aws', secret: name });
    return res.json({ ok:true, message: `Created AWS secret ${name}` });
  }catch(err){
    console.error('CreateSecret error', err);
    if(err?.name === 'ResourceExistsException'){
      return res.status(409).json({ ok:false, error: 'secret already exists' });
    }
    return res.status(500).json({ ok:false, error: err.message });
  }
});

// Rotate secret (placeholder - do not modify backend infra)
router.post('/rotate/:name', requirePermission('canView'), async (req, res) => {
  const name = req.params.name;
  let meta = null;
  try{
    meta = await client.send(new DescribeSecretCommand({ SecretId: name }));
  }catch(err){
    return res.status(500).json({ ok:false, error: 'failed to verify secret ownership', details: err.message });
  }

  if(!isAdminUser(req) && !isOwnedByUser(meta, req.user?.user)){
    raisePrivacyAlert({ action: 'secret_owner_mismatch', user: req.user?.user || 'unknown', role: req.user?.role || 'unknown', path: req.path, detail: `attempted rotate of ${name}`, severity: 'high' });
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'unauthorized_rotate', provider: 'aws', secret: name, reason: 'owner_mismatch' });
    await notifyOwnerOnUnauthorized(name, meta, req, 'rotation');
    return res.status(403).json({ ok:false, error: 'forbidden: you can only rotate your own secrets' });
  }

  if(!req.user?.permissions?.canRotate && !isAdminUser(req) && !isOwnedByUser(meta, req.user?.user)){
    raisePrivacyAlert({ action: 'forbidden_rotate', user: req.user?.user || 'unknown', role: req.user?.role || 'unknown', path: req.path, detail: `missing rotate permission for ${name}`, severity: 'high' });
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'unauthorized_rotate', provider: 'aws', secret: name, reason: 'missing_permission' });
    await notifyOwnerOnUnauthorized(name, meta, req, 'rotation');
    return res.status(403).json({ ok:false, error: 'forbidden: missing rotate permission' });
  }
  appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'rotate_request', provider: 'aws', secret: name });

  // If an EventBridge bus and detail-type are configured, put an event so existing infra can react
  const bus = process.env.ROTATION_EVENT_BUS; // optional
  const detailType = process.env.ROTATION_DETAIL_TYPE || 'SecretRotationRequested';
  if(bus){
    try{
      const event = {
        Entries: [
          {
            EventBusName: bus,
            Source: 'cloudvault.central',
            DetailType: detailType,
            Detail: JSON.stringify({ secretName: name, requestedBy: req.user?.user || 'anon' })
          }
        ]
      };
      await ebClient.send(new PutEventsCommand(event));
      return res.json({ ok:true, message: `Rotation event sent for ${name}` });
    }catch(err){
      console.error('EventBridge put error', err);
      return res.status(500).json({ ok:false, error: 'failed to send rotation event', details: err.message });
    }
  }

  // Fallback: attempt to call AWS Secrets Manager RotateSecret directly
  try{
    const rotateCmd = new RotateSecretCommand({ SecretId: name });
    const rotateOut = await client.send(rotateCmd);
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'rotate_initiated', provider: 'aws', secret: name, result: 'initiated' });
    return res.json({ ok:true, message: `Rotation initiated for ${name}`, data: rotateOut });
  }catch(err){
    console.error('RotateSecret error', err);
    try{
      const nextValue = generatePassword();
      await client.send(new PutSecretValueCommand({
        SecretId: name,
        SecretString: nextValue
      }));
      appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'rotate_generated', provider: 'aws', secret: name, result: 'updated_secret_value' });
      return res.json({ ok:true, message: `Secret value rotated for ${name}` });
    }catch(fallbackErr){
      appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'rotate_failed', provider: 'aws', secret: name, error: fallbackErr.message });
      return res.status(500).json({ ok:false, error: 'failed to rotate secret', details: fallbackErr.message });
    }
  }
});

module.exports = router;
