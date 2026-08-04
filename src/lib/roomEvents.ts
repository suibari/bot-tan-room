// お部屋で起きたできごとを affirmative_bot.room_events に残す。
//
// biorhythm_server がこれを読んで「いま何をしているか」の生成材料にする（お部屋に来てくれた
// 人の名前やプレゼントが botたんの行動描写に現れる）。エネルギー加算は従来どおり
// followers.room_interaction_count が担当していて、こちらとは別経路。
//
// 重要: この関数は必ず await すること。
// edge ランタイムは Response を返した時点で実行コンテキストを破棄できるため、
// fire-and-forget にすると POST が発行される前に打ち切られて記録が消える
// （`keepalive` は発行済みリクエストしか守らない）。実際これで greeting / chat が
// 一件も残らない不具合を出している。await していれば途中に GET を挟んでも安全。

export type RoomEventType = 'gift' | 'chat' | 'greeting';

export type RoomEventResult = 'recorded' | 'throttled' | 'skipped' | 'failed';

/**
 * 同じ人の同じ種別を何度も残さないための間隔。
 *
 * 判定は room_events 自身を見る。呼び出し側の状態（last_room_visit_at など）を
 * 基準にしてはいけない: あれは来訪のたびに更新されるので、頻繁に訪れている人ほど
 * 「前回からの経過」が伸びず、永久に記録されないという罠になる（実際にやらかした）。
 */
const THROTTLE_MS = 30 * 60 * 1000;

/** できごとの説明はここで頭打ちにする（biorhythm 側でも80文字に切るが、DBに長文を溜めない）。 */
const DETAIL_MAX_CHARS = 80;

/**
 * できごとを1件記録する。失敗しても投げない（お部屋の応答を止めない）。
 *
 * @param detail プレゼント内容・会話の話題など。ユーザー入力なので、読む側は必ずデータとして扱う。
 * @returns 何が起きたか。呼び出し側がレスポンスに載せて切り分けられるようにしている。
 */
export async function recordRoomEvent(
  did: string,
  type: RoomEventType,
  detail?: string | null,
): Promise<RoomEventResult> {
  const DB_URL = process.env.DB_URL ?? 'https://db.suibari.com';
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID_DB;
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET_DB;

  if (!CF_ID || !CF_SECRET) {
    console.warn('[roomEvents] Cloudflare Access credentials not configured, skipping.');
    return 'skipped';
  }

  const headers: HeadersInit = {
    'Accept-Profile': 'affirmative_bot',
    'Content-Profile': 'affirmative_bot',
    'cf-access-client-id': CF_ID,
    'cf-access-client-secret': CF_SECRET,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // プレゼントは1日1回制限が別にあるので間引かない。
    if (type !== 'gift') {
      const since = new Date(Date.now() - THROTTLE_MS).toISOString();
      const recentRes = await fetch(
        `${DB_URL}/room_events?did=eq.${encodeURIComponent(did)}&type=eq.${type}` +
          `&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
        { headers },
      );
      if (recentRes.ok) {
        const rows = await recentRes.json();
        if (Array.isArray(rows) && rows.length > 0) return 'throttled';
      }
      // 取得に失敗したときは抑制しない。取りこぼすより重複するほうがまし。
    }

    const trimmed = detail?.trim();
    const res = await fetch(`${DB_URL}/room_events`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        did,
        type,
        detail: trimmed ? trimmed.slice(0, DETAIL_MAX_CHARS) : null,
      }),
      keepalive: true,
    });
    if (!res.ok) {
      // 404 はスキーマキャッシュ未更新（NOTIFY pgrst, 'reload schema'）、401 は GRANT 漏れ。
      const body = await res.text().catch(() => '');
      throw new Error(`insert failed: ${res.status} ${body}`);
    }
    return 'recorded';
  } catch (e) {
    console.warn('[roomEvents] failed to record room event:', e);
    return 'failed';
  }
}
