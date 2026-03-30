const MAX_ALERTS = 300;
const alerts = [];

function raisePrivacyAlert(entry){
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    severity: entry?.severity || 'high',
    title: entry?.title || 'Potential data privacy leakage',
    ...entry
  };
  alerts.push(item);
  if (alerts.length > MAX_ALERTS) alerts.shift();
  return item;
}

function getPrivacyAlerts({ since, limit = 50 } = {}){
  const max = Math.max(1, Math.min(200, Number(limit) || 50));
  let out = alerts;
  if (since){
    const sinceMs = new Date(since).getTime();
    if (!Number.isNaN(sinceMs)){
      out = out.filter((a) => new Date(a.ts).getTime() > sinceMs);
    }
  }
  return out.slice(-max).reverse();
}

module.exports = { raisePrivacyAlert, getPrivacyAlerts };
