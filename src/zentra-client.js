export class ZentraAPIError extends Error {
  constructor(message, { status, url, details } = {}) {
    super(message);
    this.name = 'ZentraAPIError';
    this.status = status;
    this.url = url;
    this.details = details;
  }
}

export async function uploadDiscordImport({ baseUrl, importToken, payload }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/communities/import/discord`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Discord-Import-Token': importToken,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const errorMessage = parsed?.error || `HTTP ${response.status}`;
    throw new ZentraAPIError(`Zentra import failed: ${errorMessage}`, {
      status: response.status,
      url,
      details: parsed,
    });
  }

  return parsed?.data ?? parsed;
}

export function toAbsoluteInviteUrl(baseUrl, inviteUrl) {
  if (!inviteUrl) {
    return null;
  }

  if (inviteUrl.startsWith('http://') || inviteUrl.startsWith('https://')) {
    return inviteUrl;
  }

  return `${baseUrl.replace(/\/$/, '')}${inviteUrl.startsWith('/') ? '' : '/'}${inviteUrl}`;
}
