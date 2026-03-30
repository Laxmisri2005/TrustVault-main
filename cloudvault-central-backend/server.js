require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const awsRoutes = require('./routes/aws');
const azureRoutes = require('./routes/azure');
const gcpRoutes = require('./routes/gcp');
const rotationRoutes = require('./routes/rotation');
const authRoutes = require('./routes/auth');
const { readLogs } = require('./utils/audit');
const { getPrivacyAlerts } = require('./utils/privacyAlerts');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// Log endpoint to show server is alive
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// mount cloud routes
app.use('/api/aws', awsRoutes);
app.use('/api/azure', azureRoutes);
app.use('/api/gcp', gcpRoutes);
app.use('/api/rotation', rotationRoutes);

app.get('/api/logs', (req, res) => {
  const entries = readLogs(200);
  res.json({ ok: true, logs: entries });
});

app.get('/api/alerts', (req, res) => {
  const since = req.query.since;
  const limit = req.query.limit;
  const alerts = getPrivacyAlerts({ since, limit });
  res.json({ ok: true, alerts });
});

// Serve a tiny status page
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'CloudVault Central Backend' });
});

// Serve frontend static build if present
const fs = require('fs');
const staticCandidates = [
  process.env.FRONTEND_DIST_DIR,
  path.join(__dirname, 'dist'),
  path.join(__dirname, '..', 'cloudvault-central-frontend', 'dist')
].filter(Boolean);
const staticPath = staticCandidates.find((candidate) => fs.existsSync(candidate));

if (staticPath){
  app.use(express.static(staticPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ ok:false, error:'not found' });
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`CloudVault backend listening on http://127.0.0.1:${port}`));
