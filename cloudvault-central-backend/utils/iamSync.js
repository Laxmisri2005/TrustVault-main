const {
  IAMClient,
  ListUsersCommand,
  ListAccessKeysCommand,
  ListAttachedUserPoliciesCommand,
  ListUserPoliciesCommand,
  GetUserPolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListGroupsForUserCommand,
  ListAttachedGroupPoliciesCommand,
  ListGroupPoliciesCommand,
  GetGroupPolicyCommand
} = require('@aws-sdk/client-iam');

const region = process.env.AWS_REGION || 'ap-south-1';
const iam = new IAMClient({ region });

const ROLE_PRIORITY = ['Admin', 'Developer', 'Auditor'];
const DEFAULT_TTL_MS = Math.max(5, Number(process.env.IAM_SYNC_TTL_SECONDS || 30)) * 1000;

let cache = { ts: 0, data: null };

function toArray(v){
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parsePolicyDocument(raw){
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch (_) {}
  try { return JSON.parse(decodeURIComponent(raw)); } catch (_) {}
  return null;
}

function collectAllowActions(policyDoc){
  const actions = new Set();
  if (!policyDoc) return actions;
  const statements = toArray(policyDoc.Statement);
  for (const st of statements){
    if (!st || String(st.Effect || '').toLowerCase() !== 'allow') continue;
    for (const action of toArray(st.Action)){
      if (!action) continue;
      actions.add(String(action).toLowerCase());
    }
  }
  return actions;
}

function actionMatches(granted, needed){
  const g = String(granted || '').toLowerCase();
  const n = String(needed || '').toLowerCase();
  if (!g || !n) return false;
  if (g === '*' || g === n) return true;
  if (g.endsWith('*')) return n.startsWith(g.slice(0, -1));
  return false;
}

function hasAnyAction(actions, needed){
  for (const want of needed){
    for (const granted of actions){
      if (actionMatches(granted, want)) return true;
    }
  }
  return false;
}

function derivePermissions(actions, policyNames = []){
  const lowerPolicyNames = (policyNames || []).map((p) => String(p || '').toLowerCase());
  const hasReadOnlyNamedPolicy = lowerPolicyNames.some((p) => p.includes('readonly') || p.includes('read-only'));
  const canView = hasAnyAction(actions, [
    'secretsmanager:getsecretvalue',
    'secretsmanager:listsecrets',
    'secretsmanager:describesecret',
    's3:get*',
    's3:list*',
    'secretsmanager:*',
    '*'
  ]) || hasReadOnlyNamedPolicy;
  const canRotate = hasAnyAction(actions, [
    'secretsmanager:rotatesecret',
    'secretsmanager:*',
    '*'
  ]);
  const canDelete = hasAnyAction(actions, [
    'secretsmanager:deletesecret',
    'secretsmanager:*',
    '*'
  ]);
  return { canView, canRotate, canDelete };
}

function deriveRoles(permissions){
  const out = new Set();
  if (permissions.canView) out.add('Auditor');
  if (permissions.canRotate) out.add('Developer');
  if (permissions.canDelete) out.add('Admin');
  return ROLE_PRIORITY.filter((r) => out.has(r));
}

async function listWithMarker(buildCommand, listKey){
  const out = [];
  let marker = undefined;
  do{
    const resp = await iam.send(buildCommand(marker));
    out.push(...(resp[listKey] || []));
    marker = resp.IsTruncated ? resp.Marker : undefined;
  }while(marker);
  return out;
}

async function getManagedPolicyDoc(policyArn){
  if (!policyArn) return null;
  const policy = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
  const versionId = policy?.Policy?.DefaultVersionId;
  if (!versionId) return null;
  const version = await iam.send(new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: versionId }));
  return parsePolicyDocument(version?.PolicyVersion?.Document);
}

async function collectUserAccess(userName){
  const actions = new Set();
  const policyNames = [];
  const groups = [];

  const attachedUserPolicies = await listWithMarker(
    (marker) => new ListAttachedUserPoliciesCommand({ UserName: userName, Marker: marker }),
    'AttachedPolicies'
  );
  for (const p of attachedUserPolicies){
    if (p?.PolicyName) policyNames.push(`user-attached:${p.PolicyName}`);
    const doc = await getManagedPolicyDoc(p?.PolicyArn);
    for (const a of collectAllowActions(doc)) actions.add(a);
  }

  const inlineUserPolicyNames = await listWithMarker(
    (marker) => new ListUserPoliciesCommand({ UserName: userName, Marker: marker }),
    'PolicyNames'
  );
  for (const name of inlineUserPolicyNames){
    policyNames.push(`user-inline:${name}`);
    const p = await iam.send(new GetUserPolicyCommand({ UserName: userName, PolicyName: name }));
    const doc = parsePolicyDocument(p?.PolicyDocument);
    for (const a of collectAllowActions(doc)) actions.add(a);
  }

  const userGroups = await listWithMarker(
    (marker) => new ListGroupsForUserCommand({ UserName: userName, Marker: marker }),
    'Groups'
  );
  for (const g of userGroups){
    if (!g?.GroupName) continue;
    groups.push(g.GroupName);

    const attachedGroupPolicies = await listWithMarker(
      (marker) => new ListAttachedGroupPoliciesCommand({ GroupName: g.GroupName, Marker: marker }),
      'AttachedPolicies'
    );
    for (const p of attachedGroupPolicies){
      if (p?.PolicyName) policyNames.push(`group:${g.GroupName}:${p.PolicyName}`);
      const doc = await getManagedPolicyDoc(p?.PolicyArn);
      for (const a of collectAllowActions(doc)) actions.add(a);
    }

    const inlineGroupPolicyNames = await listWithMarker(
      (marker) => new ListGroupPoliciesCommand({ GroupName: g.GroupName, Marker: marker }),
      'PolicyNames'
    );
    for (const name of inlineGroupPolicyNames){
      policyNames.push(`group-inline:${g.GroupName}:${name}`);
      const gp = await iam.send(new GetGroupPolicyCommand({ GroupName: g.GroupName, PolicyName: name }));
      const doc = parsePolicyDocument(gp?.PolicyDocument);
      for (const a of collectAllowActions(doc)) actions.add(a);
    }
  }

  const permissions = derivePermissions(actions, policyNames);
  const roleOptions = deriveRoles(permissions);
  const defaultRole = roleOptions[0] || null;

  return {
    permissions,
    roleOptions,
    defaultRole,
    policyNames: Array.from(new Set(policyNames)).sort(),
    groups: Array.from(new Set(groups)).sort()
  };
}

async function listUserAccessKeys(userName){
  const keys = await listWithMarker(
    (marker) => new ListAccessKeysCommand({ UserName: userName, Marker: marker }),
    'AccessKeyMetadata'
  );
  return (keys || []).map((k) => ({
    accessKeyId: k.AccessKeyId,
    status: k.Status,
    createDate: k.CreateDate
  }));
}

async function getIamAccessSnapshot({ force = false } = {}){
  const now = Date.now();
  if (!force && cache.data && now - cache.ts < DEFAULT_TTL_MS){
    return cache.data;
  }

  const users = await listWithMarker(
    (marker) => new ListUsersCommand({ Marker: marker }),
    'Users'
  );

  const mapped = await Promise.all(users.map(async (u) => {
    const access = await collectUserAccess(u.UserName);
    return {
      userName: u.UserName,
      arn: u.Arn,
      createDate: u.CreateDate,
      path: u.Path,
      permissions: access.permissions,
      roleOptions: access.roleOptions,
      defaultRole: access.defaultRole,
      groups: access.groups,
      policyNames: access.policyNames
    };
  }));

  const data = {
    syncedAt: new Date().toISOString(),
    ttlSeconds: Math.round(DEFAULT_TTL_MS / 1000),
    users: mapped.sort((a, b) => a.userName.localeCompare(b.userName))
  };
  cache = { ts: now, data };
  return data;
}

async function findUserAccess(userName, { force = false } = {}){
  const snapshot = await getIamAccessSnapshot({ force });
  const wanted = String(userName || '').trim().toLowerCase();
  return snapshot.users.find((u) => u.userName.toLowerCase() === wanted) || null;
}

async function findUserAccessByAccessKey(accessKeyId, { force = false } = {}){
  const wanted = String(accessKeyId || '').trim();
  if (!wanted) return null;

  const snapshot = await getIamAccessSnapshot({ force });
  for (const user of snapshot.users){
    const keys = await listUserAccessKeys(user.userName);
    if (keys.some((k) => String(k.accessKeyId || '').trim() === wanted)){
      return user;
    }
  }
  return null;
}

module.exports = { getIamAccessSnapshot, findUserAccess, findUserAccessByAccessKey };
