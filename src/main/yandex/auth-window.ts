import { shell } from 'electron';

const CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d';
const CLIENT_SECRET = '53bc75238f0c4d08a118e51fe9203300';

export interface DeviceAuthProgress {
  verification_url: string;
  user_code: string;
}

/**
 * Full device-authorization flow (RFC 8628).
 * 1. Request device+user code from Yandex
 * 2. Open verification URL in system browser
 * 3. Poll until user approves or timeout
 * Returns the OAuth access token.
 */
export async function loginWithDeviceFlow(
  onProgress: (p: DeviceAuthProgress) => void,
): Promise<string> {
  // Step 1 — request device code
  const codeRes = await fetch('https://oauth.yandex.ru/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID }).toString(),
  });
  const codeData = await codeRes.json() as Record<string, unknown>;

  if (!codeRes.ok || typeof codeData['device_code'] !== 'string') {
    throw new Error(`Yandex device code error: ${JSON.stringify(codeData)}`);
  }

  const deviceCode = codeData['device_code'] as string;
  const userCode = codeData['user_code'] as string;
  const verificationUrl = (codeData['verification_url'] ?? 'https://ya.ru/device') as string;
  const interval = ((codeData['interval'] as number) ?? 5) * 1000;
  const expiresIn = ((codeData['expires_in'] as number) ?? 300) * 1000;

  // Step 2 — open browser + notify renderer
  await shell.openExternal(verificationUrl);
  onProgress({ verification_url: verificationUrl, user_code: userCode });

  // Step 3 — poll
  const deadline = Date.now() + expiresIn;
  while (Date.now() < deadline) {
    await sleep(interval);

    const tokenRes = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'device_code',
        code: deviceCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;

    if (typeof tokenData['access_token'] === 'string') {
      return tokenData['access_token'];
    }

    const err = tokenData['error'] as string | undefined;
    if (err === 'authorization_pending' || err === 'slow_down') continue;
    throw new Error(`Яндекс: ${tokenData['error_description'] ?? err ?? JSON.stringify(tokenData)}`);
  }

  throw new Error('Время ожидания подтверждения истекло. Попробуй снова.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
