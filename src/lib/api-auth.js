const USER_POOL_ID = "ap-east-1_In4wDJ1Oz";
const CLIENT_ID = "2mkh4lvgmrrnmkkvqa1dg72tf0";
const ISSUER = `https://cognito-idp.ap-east-1.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

let jwksPromise;

function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getKeys() {
  if (!jwksPromise) {
    jwksPromise = fetch(JWKS_URL).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load sign-in keys");
      const body = await response.json();
      return Array.isArray(body.keys) ? body.keys : [];
    });
  }
  return jwksPromise;
}

async function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  if (header.alg !== "RS256" || !header.kid) return false;
  if (payload.iss !== ISSUER || payload.token_use !== "id" || payload.aud !== CLIENT_ID) return false;
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) return false;

  const jwk = (await getKeys()).find((key) => key.kid === header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodePart(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
}

/** Return the verified bearer token, or null without exposing verification details. */
export async function verifiedBearer(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token) return null;

  try {
    return (await verifyToken(token)) ? token : null;
  } catch {
    return null;
  }
}