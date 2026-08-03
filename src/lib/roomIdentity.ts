// お部屋自身の識別子まわり。クライアントとサーバの両方から参照する。

/**
 * お部屋のサービス DID。
 * https://room.bot-tan.com/.well-known/did.json （public/.well-known/did.json）で解決される。
 * service auth JWT の aud として使う。
 */
export const ROOM_SERVICE_DID = 'did:web:room.bot-tan.com';

/**
 * セッション発行専用の lxm。
 *
 * service auth トークンは lxm で用途が縛られる。ここを専用の値にしておくことで、
 * 他の用途に取ったトークンをセッション発行へ流用されるのを防ぐ。
 */
export const ROOM_SESSION_LXM = 'com.bot-tan.room.createSession';

/** SSO チケットの発行者（Nagi AppView）。 */
export const NAGI_PASSPORT_ISSUER = 'https://nagi-api.suibari.com';

/** チケットの aud。お部屋の canonical origin と一致させる。 */
export const ROOM_ORIGIN = 'https://room.bot-tan.com';
