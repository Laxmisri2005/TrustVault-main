const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'access.log');

function appendLog(entry){
  const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry));
  fs.appendFileSync(logFile, line + '\n');
}

function readLogs(limit = 200){
  if(!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
  const last = lines.slice(-limit).map(l=>{
    try{ return JSON.parse(l) }catch(e){ return { raw: l } }
  });
  return last.reverse();
}

module.exports = { appendLog, readLogs };
