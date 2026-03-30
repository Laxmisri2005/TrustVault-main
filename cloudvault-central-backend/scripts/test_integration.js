// Simple integration test script: login and call API endpoints
const fetch = global.fetch || require('node-fetch');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';

async function run(){
  console.log('Ping', base);
  console.log(await (await fetch(base+'/')).json());

  const login = await (await fetch(base+'/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ role:'Developer', user:'dev' }) })).json();
  console.log('Token (dev):', login.token?.slice(0,20)+'...');

  const secrets = await (await fetch(base+'/api/aws/secrets', { headers: { Authorization: `Bearer ${login.token}` } })).json();
  console.log('AWS secrets count:', secrets.secrets?.length||0);
}

run().catch(e=>{ console.error(e); process.exit(1) })
