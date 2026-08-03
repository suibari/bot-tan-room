// atproto の service auth JWT を検証する。
//
// 利用者のブラウザが自分の PDS に com.atproto.server.getServiceAuth を投げて得た
// 短命 JWT を、お部屋のサーバが「本当にその DID の持ち主が発行させたもの」として
// 検証する。検証できて初めてセッション cookie を発行する。
//
// なぜ SubtleCrypto だけで書けないか:
//   atproto の署名鍵は多くのアカウントで secp256k1（ES256K）だが、SubtleCrypto は
//   secp256k1 に対応していない（workerd では鍵の生成すらできても検証はできない）。
//   なうぷれあっとが oauth.ts で踏んだのと同じ制約なので、曲線演算だけ @noble/curves
//   に任せる。ハッシュは SubtleCrypto をそのまま使う。

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { p256 } from '@noble/curves/nist.js';
import { base58 } from '@scure/base';

/** did:key / Multikey の multicodec 前置バイト。 */
const MULTICODEC = {
  secp256k1: [0xe7, 0x01],
  p256: [0x80, 0x24],
} as const;

export class ServiceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceAuthError';
  }
}

function b64uToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function jsonFromB64u(segment: string): Record<string, unknown> {
  const parsed = JSON.parse(new TextDecoder().decode(b64uToBytes(segment)));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ServiceAuthError('Segment is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

interface AtprotoKey {
  curve: 'secp256k1' | 'p256';
  publicKey: Uint8Array;
}

/** DID ドキュメントを取得する。did:plc は plc.directory、did:web は当該ホスト。 */
async function resolveDidDocument(did: string): Promise<Record<string, unknown>> {
  let url: string;
  if (did.startsWith('did:plc:')) {
    url = `https://plc.directory/${encodeURIComponent(did)}`;
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length);
    // did:web はホスト部にコロン区切りのパスを持てるが、ここでは単純なホストのみ扱う。
    if (host.includes(':') || !/^[a-z0-9.-]+$/i.test(host)) {
      throw new ServiceAuthError(`Unsupported did:web form: ${did}`);
    }
    url = `https://${host}/.well-known/did.json`;
  } else {
    throw new ServiceAuthError(`Unsupported DID method: ${did}`);
  }

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ServiceAuthError(`DID resolution failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

/** DID ドキュメントから atproto の署名鍵を取り出す。 */
function extractAtprotoKey(doc: Record<string, unknown>): AtprotoKey {
  const methods = doc.verificationMethod;
  if (!Array.isArray(methods)) throw new ServiceAuthError('DID document has no verificationMethod');

  const method = methods.find(
    (m) => typeof m?.id === 'string' && m.id.endsWith('#atproto'),
  ) as { publicKeyMultibase?: unknown } | undefined;
  const multibase = method?.publicKeyMultibase;
  if (typeof multibase !== 'string' || !multibase.startsWith('z')) {
    throw new ServiceAuthError('DID document has no #atproto Multikey');
  }

  const decoded = base58.decode(multibase.slice(1));
  for (const [curve, prefix] of Object.entries(MULTICODEC) as [
    'secp256k1' | 'p256',
    readonly number[],
  ][]) {
    if (decoded[0] === prefix[0] && decoded[1] === prefix[1]) {
      return { curve, publicKey: decoded.slice(2) };
    }
  }
  throw new ServiceAuthError('Unsupported key type in DID document');
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(digest);
}

export interface VerifyServiceAuthOptions {
  /** 自分のサービス DID。JWT の aud がこれと一致しなければ拒否する。 */
  audience: string;
  /** 期待する lxm。トークンの用途を固定するため、必ず指定する。 */
  lxm: string;
  /** 時計ずれの許容秒数。既定 30。 */
  clockToleranceSec?: number;
}

/**
 * service auth JWT を検証し、発行者（利用者）の DID を返す。
 *
 * 検証順序は nagi-passport と同じ思想:
 *   alg は固定値との一致で確認し、header の値でアルゴリズムを選ばない。
 *   署名を確認してからクレームを信用する。
 */
export async function verifyServiceAuth(
  token: string,
  { audience, lxm, clockToleranceSec = 30 }: VerifyServiceAuthOptions,
): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new ServiceAuthError('Token must have three segments');
  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new ServiceAuthError('Token has an empty segment');
  }

  const header = jsonFromB64u(headerB64);
  const alg = header.alg;
  if (alg !== 'ES256K' && alg !== 'ES256') {
    throw new ServiceAuthError(`Unsupported alg: ${String(alg)}`);
  }

  // iss は鍵を引くために先に読む必要があるが、署名検証が済むまで身元として扱わない。
  const payload = jsonFromB64u(payloadB64);
  const iss = payload.iss;
  if (typeof iss !== 'string' || !iss.startsWith('did:')) {
    throw new ServiceAuthError('Claim iss is not a DID');
  }

  const key = extractAtprotoKey(await resolveDidDocument(iss));
  // header の alg と鍵の種類が食い違うトークンは受けない。
  if ((alg === 'ES256K') !== (key.curve === 'secp256k1')) {
    throw new ServiceAuthError('alg does not match the key in the DID document');
  }

  const signature = b64uToBytes(signatureB64);
  if (signature.length !== 64) throw new ServiceAuthError('Signature must be 64 bytes');
  const messageHash = await sha256(new TextEncoder().encode(`${headerB64}.${payloadB64}`));

  const curve = key.curve === 'secp256k1' ? secp256k1 : p256;
  // atproto は low-S 正規形のみを有効とする（malleability 対策）。
  const ok = curve.verify(signature, messageHash, key.publicKey, { lowS: true, prehash: false });
  if (!ok) throw new ServiceAuthError('Signature verification failed');

  // --- ここから先は署名済み。それでもクレームは必ず確認する。 ---
  if (payload.aud !== audience) {
    throw new ServiceAuthError(`Unexpected audience: ${String(payload.aud)}`);
  }
  // lxm でトークンの用途を固定する。これが無いと、他用途に取ったトークンを
  // セッション発行に流用できてしまう。
  if (payload.lxm !== lxm) {
    throw new ServiceAuthError(`Unexpected lxm: ${String(payload.lxm)}`);
  }
  const exp = payload.exp;
  if (typeof exp !== 'number') throw new ServiceAuthError('Claim exp must be a number');
  if (exp + clockToleranceSec < Math.floor(Date.now() / 1000)) {
    throw new ServiceAuthError('Token has expired');
  }

  return iss;
}
