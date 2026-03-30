const express = require('express');
const router = express.Router();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { requirePermission } = require('../middleware/auth');
const { appendLog } = require('../utils/audit');

const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;
let client = null;
if(keyVaultUrl){
  const cred = new DefaultAzureCredential();
  client = new SecretClient(keyVaultUrl, cred);
}

function maskValue(v){
  if(v==null) return '';
  const s = String(v);
  if(s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0,2) + '*'.repeat(Math.max(0, s.length-4)) + s.slice(-2);
}

router.get('/secrets', requirePermission('canView'), async (req, res) => {
  if(!client) return res.status(500).json({ ok:false, error: 'Azure Key Vault not configured' });
  try{
    const iter = client.listPropertiesOfSecrets();
    const out = [];
    for await (const s of iter){
      out.push({ name: s.name, enabled: s.enabled, updatedOn: s.updatedOn });
    }
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'list_secrets', provider: 'azure' });
    res.json({ ok:true, secrets: out });
  }catch(err){
    console.error('Azure list error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

router.get('/secret/:name', requirePermission('canView'), async (req, res) => {
  if(!client) return res.status(500).json({ ok:false, error: 'Azure Key Vault not configured' });
  const name = req.params.name;
  try{
    const sec = await client.getSecret(name);
    const value = sec.value || '';
    const revealed = (req.user && req.user.role === 'Admin');
    const display = revealed ? value : maskValue(value);
    appendLog({ user: req.user?.user || 'anon', role: req.user?.role || 'unknown', action: 'get_secret', provider: 'azure', secret: name, revealed });
    res.json({ ok:true, name, value: display, rawAllowed: revealed ? true:false });
  }catch(err){
    console.error('Azure get error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

module.exports = router;
