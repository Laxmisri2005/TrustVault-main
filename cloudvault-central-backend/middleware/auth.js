const jwt = require('jsonwebtoken');
const { appendLog } = require('../utils/audit');
const { findUserAccess } = require('../utils/iamSync');
const { sendSecurityAlert } = require('../utils/alertMailer');
const { raisePrivacyAlert } = require('../utils/privacyAlerts');

function reqMeta(req){
  return {
    path: req.path,
    method: req.method,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  };
}

function verifyRequestToken(req){
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '') || null;
  if(!token){
    const err = new Error('missing token');
    err.status = 401;
    throw err;
  }
  return jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
}

function rolePermissionFallback(role){
  if(role === 'Admin') return { canView: true, canRotate: true, canDelete: true };
  if(role === 'Developer') return { canView: true, canRotate: true, canDelete: false };
  if(role === 'Auditor') return { canView: true, canRotate: false, canDelete: false };
  return { canView: false, canRotate: false, canDelete: false };
}

function requireRole(roles = []){
  return (req, res, next) => {
    try{
      const payload = verifyRequestToken(req);
      req.user = payload;
      if(roles.length && !roles.includes(payload.role)){
        appendLog({ user: payload.user || 'unknown', role: payload.role || 'unknown', action: 'forbidden', path: req.path });
        raisePrivacyAlert({ action: 'forbidden', user: payload.user || 'unknown', role: payload.role || 'unknown', path: req.path, detail: 'blocked by role restriction', severity: 'high' });
        sendSecurityAlert({ action: 'forbidden', user: payload.user || 'unknown', role: payload.role || 'unknown', ...reqMeta(req) }).catch(()=>{});
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      next();
    }catch(err){
      if(err.status === 401){
        appendLog({ user: 'anon', role: 'none', action: 'unauthorized_missing_token', path: req.path });
        raisePrivacyAlert({ action: 'unauthorized_missing_token', user: 'anon', role: 'none', path: req.path, detail: 'no token sent', severity: 'medium' });
        sendSecurityAlert({ action: 'unauthorized_missing_token', user: 'anon', role: 'none', ...reqMeta(req) }).catch(()=>{});
        return res.status(401).json({ ok:false, error: 'missing token' });
      }
      appendLog({ user: 'anon', role: 'invalid', action: 'invalid_token', path: req.path, error: err.message });
      raisePrivacyAlert({ action: 'invalid_token', user: 'anon', role: 'invalid', path: req.path, detail: err.message, severity: 'high' });
      sendSecurityAlert({ action: 'invalid_token', user: 'anon', role: 'invalid', error: err.message, ...reqMeta(req) }).catch(()=>{});
      return res.status(401).json({ ok:false, error: 'invalid token' });
    }
  }
}

function requirePermission(permissionKey){
  return async (req, res, next) => {
    try{
      const payload = verifyRequestToken(req);
      let permissions = payload.permissions || rolePermissionFallback(payload.role);
      if(payload.user){
        try{
          const live = await findUserAccess(payload.user, { force: false });
          if(live?.permissions) permissions = live.permissions;
        }catch(err){
          // If IAM sync fails temporarily, fallback to token claims for availability.
          console.error('Live IAM permission sync failed', err.message);
        }
      }
      req.user = { ...payload, permissions };
      if(!permissions[permissionKey]){
        appendLog({ user: payload.user || 'unknown', role: payload.role || 'unknown', action: 'forbidden', path: req.path, permissionKey });
        raisePrivacyAlert({ action: 'forbidden', user: payload.user || 'unknown', role: payload.role || 'unknown', path: req.path, detail: `missing permission:${permissionKey}`, severity: 'high' });
        sendSecurityAlert({ action: 'forbidden', user: payload.user || 'unknown', role: payload.role || 'unknown', error: `missing permission:${permissionKey}`, ...reqMeta(req) }).catch(()=>{});
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      next();
    }catch(err){
      if(err.status === 401){
        appendLog({ user: 'anon', role: 'none', action: 'unauthorized_missing_token', path: req.path });
        raisePrivacyAlert({ action: 'unauthorized_missing_token', user: 'anon', role: 'none', path: req.path, detail: 'no token sent', severity: 'medium' });
        sendSecurityAlert({ action: 'unauthorized_missing_token', user: 'anon', role: 'none', ...reqMeta(req) }).catch(()=>{});
        return res.status(401).json({ ok:false, error: 'missing token' });
      }
      appendLog({ user: 'anon', role: 'invalid', action: 'invalid_token', path: req.path, error: err.message });
      raisePrivacyAlert({ action: 'invalid_token', user: 'anon', role: 'invalid', path: req.path, detail: err.message, severity: 'high' });
      sendSecurityAlert({ action: 'invalid_token', user: 'anon', role: 'invalid', error: err.message, ...reqMeta(req) }).catch(()=>{});
      return res.status(401).json({ ok:false, error: 'invalid token' });
    }
  };
}

module.exports = { requireRole, requirePermission };
