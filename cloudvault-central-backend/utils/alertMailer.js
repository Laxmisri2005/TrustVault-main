const nodemailer = require('nodemailer');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const enabled = String(process.env.ALERT_EMAIL_ENABLED || 'false').toLowerCase() === 'true';
const snsEnabled = String(process.env.ALERT_SNS_ENABLED || 'false').toLowerCase() === 'true';
const toList = (process.env.ALERT_EMAIL_TO || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const snsTopicList = (process.env.ALERT_SNS_TOPIC_ARN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const fromAddress = process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER || 'trustvault-alerts@localhost';
const cooldownMs = Math.max(5, Number(process.env.ALERT_EMAIL_COOLDOWN_SECONDS || 120)) * 1000;
const region = process.env.AWS_REGION || 'ap-south-1';

let transporter = null;
let snsClient = null;
const lastSentByKey = new Map();

function getTransporter(){
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
  return transporter;
}

function getSnsClient(){
  if (snsClient) return snsClient;
  snsClient = new SNSClient({ region });
  return snsClient;
}

function buildKey(event){
  const ip = event.ip || 'unknown-ip';
  const action = event.action || 'security_event';
  const path = event.path || 'unknown-path';
  const provider = event.provider || 'unknown-provider';
  const secret = event.secret || 'unknown-secret';
  return `${action}:${ip}:${path}:${provider}:${secret}`;
}

function inCooldown(key){
  const now = Date.now();
  const last = lastSentByKey.get(key) || 0;
  if (now - last < cooldownMs) return true;
  lastSentByKey.set(key, now);
  return false;
}

function buildMessage(event){
  const when = new Date().toISOString();
  const providerLabel = String(event.provider || 'unknown').toUpperCase();
  const secretLabel = event.secret || 'unknown-secret';
  const subject = `[TrustVault] ${providerLabel} security alert for ${secretLabel}: ${event.action || 'unauthorized access'}`;
  const body = [
    'TrustVault detected a security event.',
    '',
    'This notification was generated to protect a secret from unauthorized access or rotation.',
    '',
    `Time: ${when}`,
    `Action: ${event.action || 'unknown'}`,
    `Provider: ${event.provider || 'unknown'}`,
    `Secret: ${event.secret || 'unknown'}`,
    `User: ${event.user || 'anon'}`,
    `Role: ${event.role || 'unknown'}`,
    `Path: ${event.path || 'unknown'}`,
    `Method: ${event.method || 'unknown'}`,
    `IP: ${event.ip || 'unknown'}`,
    `User-Agent: ${event.userAgent || 'unknown'}`,
    `Error: ${event.error || 'n/a'}`,
    `Detail: ${event.detail || 'n/a'}`,
    '',
    'If this request was not expected, review recent activity and secret access permissions immediately.'
  ].join('\n');
  return { subject, body };
}

async function sendViaSns(topicArns, subject, body){
  const sns = getSnsClient();
  for (const topicArn of topicArns){
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: body
    }));
  }
}

async function sendViaSms(phoneNumbers, body){
  const sns = getSnsClient();
  for (const phoneNumber of phoneNumbers){
    await sns.send(new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: body
    }));
  }
}

async function sendSecurityAlert(event){
  const force = !!event?.force;
  const provider = String(event?.provider || '').toLowerCase();
  if (!enabled && !snsEnabled && !force) return { sent: false, reason: 'disabled', recipients: [] };

  const extraRecipients = (event?.recipients || [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const recipients = Array.from(new Set([...toList, ...extraRecipients]));

  const extraTopics = (event?.topicArns || [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const topicArns = Array.from(new Set([...snsTopicList, ...extraTopics]));

  const phoneNumbers = Array.from(new Set(
    (event?.phoneNumbers || [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  ));

  if (!recipients.length && !topicArns.length && !phoneNumbers.length){
    return { sent: false, reason: 'no_recipients', recipients: [], topicArns: [], phoneNumbers: [] };
  }

  const key = buildKey(event);
  if (inCooldown(key)) return { sent: false, reason: 'cooldown', recipients, topicArns, phoneNumbers };

  const { subject, body } = buildMessage(event);
  const tx = recipients.length ? getTransporter() : null;
  const preferSnsTopic = provider !== 'gcp' || !tx;

  if (preferSnsTopic && topicArns.length && (snsEnabled || force)){
    try{
      await sendViaSns(topicArns, subject, body);
      return { sent: true, reason: 'sent_sns', recipients, topicArns, phoneNumbers };
    }catch (err){
      if (!recipients.length && !phoneNumbers.length){
        return { sent: false, reason: `sns_failed:${err?.message || 'unknown'}`, recipients, topicArns, phoneNumbers };
      }
    }
  }

  if (phoneNumbers.length && (snsEnabled || force)){
    try{
      await sendViaSms(phoneNumbers, body);
      return { sent: true, reason: 'sent_sms', recipients, topicArns, phoneNumbers };
    }catch (err){
      if (!recipients.length){
        return { sent: false, reason: `sms_failed:${err?.message || 'unknown'}`, recipients, topicArns, phoneNumbers };
      }
    }
  }

  if (!recipients.length) return { sent: false, reason: 'no_smtp_recipients', recipients, topicArns };

  if (!tx) return { sent: false, reason: 'smtp_not_configured', recipients, topicArns, phoneNumbers };

  await tx.sendMail({
    from: fromAddress,
    to: recipients.join(','),
    subject,
    text: body
  });
  return { sent: true, reason: 'sent_smtp', recipients, topicArns, phoneNumbers };
}

module.exports = { sendSecurityAlert };
