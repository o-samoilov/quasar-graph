// Decode-only (no signature verification): the token always comes straight from the backend token endpoint.
export function decodeJwtPayload(token) {
  try {
    const seg = String(token).split('.')[1];
    if (!seg) return null;
    const parsed = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
