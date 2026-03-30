const express = require('express');
const jwt = require('jsonwebtoken');
const { getIamAccessSnapshot, findUserAccess, findUserAccessByAccessKey } = require('../utils/iamSync');

const router = express.Router();

function signToken(payload){
  return jwt.sign(payload, process.env.JWT_SECRET || 'devsecret', { expiresIn: '8h' });
}

router.get('/iam/users', async (req, res) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  try{
    const snapshot = await getIamAccessSnapshot({ force });
    res.json({ ok: true, ...snapshot });
  }catch(err){
    console.error('IAM sync error', err);
    res.status(500).json({ ok: false, error: 'failed to sync IAM users', details: err.message });
  }
});

router.post('/iam/access-key', async (req, res) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const accessKeyId = String(req.body?.accessKeyId || '').trim();
  if (!accessKeyId) {
    return res.status(400).json({ ok: false, error: 'access key is required' });
  }

  try {
    const accountUser = await findUserAccessByAccessKey(accessKeyId, { force });
    if (!accountUser) {
      return res.status(404).json({ ok: false, error: 'access key not found in AWS IAM' });
    }
    res.json({
      ok: true,
      user: accountUser.userName,
      roleOptions: accountUser.roleOptions,
      defaultRole: accountUser.defaultRole,
      permissions: accountUser.permissions
    });
  } catch (err) {
    console.error('IAM access key lookup error', err);
    res.status(500).json({ ok: false, error: 'failed to match access key', details: err.message });
  }
});

// AWS IAM backed login:
// POST /api/auth/login { "user":"alice", "role":"Developer" }
router.post('/login', async (req, res) => {
  const { role, user } = req.body || {};

  // Backward-compatible demo fallback for non-IAM flows.
  if (!user && role){
    if (String(process.env.ALLOW_DEMO_LOGIN || 'true').toLowerCase() === 'true'){
      const token = signToken({ role, user: 'demo-user' });
      return res.json({ ok: true, token, source: 'demo' });
    }
    return res.status(400).json({ ok: false, error: 'user required' });
  }

  if (!user) return res.status(400).json({ ok: false, error: 'user required' });

  try{
    const accountUser = await findUserAccess(user, { force: true });
    if (!accountUser){
      return res.status(401).json({ ok: false, error: 'user not found in AWS IAM' });
    }
    if (!accountUser.roleOptions.length){
      return res.status(403).json({ ok: false, error: 'no application access based on IAM policies' });
    }

    const requested = String(role || '').trim();
    const selectedRole = requested && accountUser.roleOptions.includes(requested)
      ? requested
      : accountUser.defaultRole;

    const token = signToken({
      user: accountUser.userName,
      role: selectedRole,
      permissions: accountUser.permissions,
      awsArn: accountUser.arn,
      policyNames: accountUser.policyNames
    });

    res.json({
      ok: true,
      token,
      source: 'aws-iam',
      user: accountUser.userName,
      role: selectedRole,
      roleOptions: accountUser.roleOptions,
      permissions: accountUser.permissions
    });
  }catch(err){
    console.error('IAM login error', err);
    res.status(500).json({ ok: false, error: 'login failed', details: err.message });
  }
});

module.exports = router;
