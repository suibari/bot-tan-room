export const MOTION_URLS = {
  diagnosis:  "/VRMA_03.vrma",  // Vサイン — 診断結果を得意げに披露
  invitation: "/VRMA_02.vrma",  // 挨拶   — お誘い来訪のお出迎え
  gift:       "/VRMA_01.vrma",  // 全身を見せる — プレゼント受け取りの喜び
  click: [
    "/VRMA_04.vrma",  // 撃つ
    "/VRMA_05.vrma",  // 回る
    "/VRMA_06.vrma",  // モデルポーズ
    "/VRMA_07.vrma",  // 屈伸運動
  ],
} as const;

export function getRandomClickMotion(): string {
  const { click } = MOTION_URLS;
  return click[Math.floor(Math.random() * click.length)];
}
