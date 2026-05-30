import crypto from 'crypto';

interface DecodedJWT {
  header: {
    alg: string;
    kid: string;
    [key: string]: any;
  };
  payload: {
    iss: string;
    sub: string;
    exp: number;
    aud?: string | string[];
    [key: string]: any;
  };
  signature: Buffer;
  signingInput: string;
}

/**
 * Parses and decodes a base64url-encoded JWT.
 */
function decodeJWT(token: string): DecodedJWT {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  // Base64url to UTF-8/Buffer
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const signature = Buffer.from(signatureB64, 'base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  return { header, payload, signature, signingInput };
}

// In-memory cache for JWKS to avoid redundant fetch requests
const jwksCache: Record<string, { keys: any[]; expiresAt: number }> = {};

/**
 * Fetches JSON Web Key Set (JWKS) from the issuer's discovery or oauth endpoints.
 */
async function fetchJWKS(iss: string): Promise<any[]> {
  const now = Date.now();
  if (jwksCache[iss] && jwksCache[iss].expiresAt > now) {
    return jwksCache[iss].keys;
  }

  let jwksUri = '';

  // 1. Try to fetch the authorization server metadata
  try {
    const metadataUrl = `${iss.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
    const metadataRes = await fetch(metadataUrl);
    if (metadataRes.ok) {
      const metadata = await metadataRes.json();
      if (metadata.jwks_uri) {
        jwksUri = metadata.jwks_uri;
      }
    }
  } catch (err) {
    console.warn(`[JWTVerifier] Failed to fetch oauth metadata for ${iss}, trying fallback:`, err);
  }

  // 2. Fallback to standard PDS oauth/jwks path if not discovered
  if (!jwksUri) {
    jwksUri = `${iss.replace(/\/$/, '')}/oauth/jwks`;
  }

  console.log(`[JWTVerifier] Fetching JWKS from: ${jwksUri}`);
  const res = await fetch(jwksUri);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri} (status: ${res.status})`);
  }
  const jwks = await res.json();
  if (!Array.isArray(jwks.keys)) {
    throw new Error('Invalid JWKS structure returned');
  }

  // Cache public keys for 10 minutes
  jwksCache[iss] = {
    keys: jwks.keys,
    expiresAt: now + 10 * 60 * 1000,
  };

  return jwks.keys;
}

/**
 * Cryptographically verifies an AT Protocol access token.
 * 
 * @param token The raw access_token JWT.
 * @param expectedDid The DID of the user asserting the session.
 * @returns boolean indicating whether the token is fully valid and matches the requested DID.
 */
export async function verifyAtprotoToken(token: string, expectedDid: string): Promise<boolean> {
  // Allow skipping token verification in local development if no token is provided to facilitate easier debugging.
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev && !token) {
    console.log(`[JWTVerifier] Dev mode: Skipping signature verification because no token was supplied.`);
    return true;
  }

  if (!token) {
    console.warn('[JWTVerifier] No token supplied for verification');
    return false;
  }

  try {
    const { header, payload, signature, signingInput } = decodeJWT(token);

    // 1. Verify subject DID
    if (payload.sub !== expectedDid) {
      console.warn(`[JWTVerifier] Subject mismatch: expected ${expectedDid}, got ${payload.sub}`);
      return false;
    }

    // 2. Verify Expiration
    const nowInSecs = Math.floor(Date.now() / 1000);
    if (payload.exp < nowInSecs) {
      console.warn(`[JWTVerifier] Token expired: expired at ${payload.exp}, current time is ${nowInSecs}`);
      return false;
    }

    // 3. Verify Issuer presence
    if (!payload.iss) {
      console.warn('[JWTVerifier] JWT is missing issuer (iss) claim');
      return false;
    }

    // 4. Retrieve JWKS matching the kid header
    const keys = await fetchJWKS(payload.iss);
    const key = keys.find((k: any) => k.kid === header.kid);
    if (!key) {
      console.warn(`[JWTVerifier] Public key for kid "${header.kid}" not found in JWKS`);
      return false;
    }

    // 5. Import JWK key natively using Node.js crypto
    const publicKey = crypto.createPublicKey({
      key: key as crypto.JsonWebKey,
      format: 'jwk',
    });

    // 6. Signature Validation
    const algMap: Record<string, string> = {
      'ES256': 'sha256',
      'RS256': 'sha256',
    };
    const algorithm = algMap[header.alg];
    if (!algorithm) {
      console.warn(`[JWTVerifier] Unsupported signature algorithm: ${header.alg}`);
      return false;
    }

    // ECDSA JWS/JWT raw signature encoding is raw (R || S) 64 bytes.
    // Node.js crypto supports raw ECDSA verification when specifying ieee-p1363.
    const isVerified = crypto.verify(
      algorithm,
      new Uint8Array(Buffer.from(signingInput)),
      {
        key: publicKey,
        dsaEncoding: header.alg.startsWith('ES') ? 'ieee-p1363' : 'der',
      },
      new Uint8Array(signature)
    );

    if (!isVerified) {
      console.warn('[JWTVerifier] JWS cryptographic signature verification failed');
    }

    return isVerified;
  } catch (err) {
    console.error('[JWTVerifier] Exception encountered during token verification:', err);
    return false;
  }
}
