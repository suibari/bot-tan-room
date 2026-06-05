export type TemplateMessage = { ja: string; en: string };

// 未サインイン用 (5個) - 初対面質問のみ。サインイン用とかぶり無し
export const GUEST_TEMPLATES: TemplateMessage[] = [
  { ja: "あなたは誰？", en: "Who are you?" },
  { ja: "いつも何してる？", en: "What do you do?" },
  { ja: "なんて名前なの？", en: "What's your name?" },
  { ja: "どんな子なの？", en: "What are you like?" },
  { ja: "何が好きなの？", en: "What do you like?" },
];

// サインイン用 (20個) - GUEST_TEMPLATESとかぶり無し
export const SIGNED_IN_TEMPLATES: TemplateMessage[] = [
  { ja: "今日何してた？", en: "How was today?" },
  { ja: "最近どう？", en: "How've you been?" },
  { ja: "なんかあった？", en: "Anything happen?" },
  { ja: "今日何食べた？", en: "What'd you eat?" },
  { ja: "疲れてない？", en: "Tired?" },
  { ja: "今何してる？", en: "What're you up to?" },
  { ja: "気分はどう？", en: "How're you feeling?" },
  { ja: "今日どうだった？", en: "How'd your day go?" },
  { ja: "悩んでることある？", en: "Anything on your mind?" },
  { ja: "今週どうだった？", en: "How was your week?" },
  { ja: "趣味はなに？", en: "What are your hobbies?" },
  { ja: "好きな音楽は？", en: "Fav music?" },
  { ja: "好きな食べ物は？", en: "Fav food?" },
  { ja: "最近ハマってる？", en: "Into anything lately?" },
  { ja: "好きな季節は？", en: "Fav season?" },
  { ja: "動物は好き？", en: "Like animals?" },
  { ja: "映画とか見る？", en: "Watch any movies?" },
  { ja: "得意なことある？", en: "What are you good at?" },
  { ja: "休日は何してる？", en: "What do you do off?" },
  { ja: "いいことあった？", en: "Good things happen?" },
];

// 現在のペアを除外して新しい2つをランダムに選ぶ
export function pickTemplatePair(
  pool: TemplateMessage[],
  excluded: number[]
): [number, number] {
  const available = pool.map((_, i) => i).filter(i => !excluded.includes(i));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return [available[0], available[1]];
}
