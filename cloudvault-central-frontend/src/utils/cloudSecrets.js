export function normalizeSecretsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.secrets)) return data.secrets;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function getCloudConnectionStatus(response) {
  if (!response) return 'error';
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return 'connected';
  if (Array.isArray(payload?.secrets)) return 'connected';
  if (Array.isArray(payload?.items)) return 'connected';
  if (Array.isArray(payload?.data)) return 'connected';
  if (payload?.ok === true) return 'connected';
  return 'error';
}
