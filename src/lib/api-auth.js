const USER_POOL_ID = "ap-east-1_In4wDJ1Oz";
const CLIENT_ID = "2mkh4lvgmrrnmkkvqa1dg72tf0";
const ISSUER = `https://cognito-idp.ap-east-1.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

let jwksPromise;
// Short, non-secret reason per request so the 401 message can say what failed.
const lastReason = new WeakMap();

function decodePart(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getKeys() {
  if (!jwksPromise) {
    jwksPromise = fetch(JWKS_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`keys-http-${response.status}`);
        const body = await response.json();
        return Array.isArray(body.keys) ? body.keys : [];
      })
      .catch((error) => {
        jwksPromise = undefined; // never cache a failed key download
        throw error;
      });
  }
  return jwksPromise;
}

/** Returns "ok" or a short reason code. */
async function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return "format";

  const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
  if (header.alg !== "RS256" || !header.kid) return "algorithm";
  if (payload.iss !== ISSUER) return "issuer";
  if (payload.token_use !== "id" || payload.aud !== CLIENT_ID) return "audience";
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) return "expired";

  const jwk = (await getKeys()).find((key) => key.kid === header.kid);
  if (!jwk) return "unknown-key";
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodePart(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  return valid ? "ok" : "signature";
}

/** Return the verified bearer token, or null. */
export async function verifiedBearer(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    console.warn("API auth: no bearer token on request");
    return null;
  }

  const token = authorization.slice(7).trim();
  if (!token) return null;

  let reason;
  try {
    reason = await verifyToken(token);
  } catch (error) {
    reason = `error: ${String(error?.message || error).slice(0, 80)}`;
  }
  lastReason.set(request, reason);
  if (reason === "ok") return token;
  console.warn("API auth: token rejected:", reason);
  return null;
}

/** User-facing 401 message that says whether a token arrived and why it failed. */
export function authFailureMessage(request) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return "Sign in is required (no sign-in token reached the server).";
  }
  const reason = lastReason.get(request) || "unknown";
  return `Your sign-in could not be verified (${reason}). Please sign out and sign in again.`;
}
