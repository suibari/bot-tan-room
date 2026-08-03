// お部屋自身の識別子まわり。クライアントとサーバの両方から参照する。

/**
 * お部屋のサービス DID。
 * https://room.bot-tan.com/.well-known/did.json （public/.well-known/did.json）で解決される。
 */
export const ROOM_DID = 'did:web:room.bot-tan.com';

/** did.json の service エントリ ID。 */
export const ROOM_SERVICE_ID = 'bot_tan_room';

/**
 * service auth の aud として使う「DID service reference」。
 * 仕様上 aud は DID 単体では不正で、サービス種別フラグメントまで必要。
 * OAuth スコープ文字列に書くときは # を %23 にエンコードする（bskyOAuth.ts 参照）。
 */
export const ROOM_SERVICE_DID = `${ROOM_DID}#${ROOM_SERVICE_ID}`;

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
