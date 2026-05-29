export type Question = { ja: string; en: string };

// Q1〜24: 自分への不満・後悔、他者との関係、本当はこうしたい、疲れ・頑張りすぎ（内面・弱み）
export const DEEP_QUESTIONS: Question[] = [
  // 自分への不満・後悔（Q1–6）
  {
    ja: "やらなきゃってわかってるのに、ずっと後回しにしてることってどんなこと？",
    en: "What's something you keep putting off, even though you know you should do it?"
  },
  {
    ja: "やめたいのにやめられない癖や習慣って、どんなもの？",
    en: "What's a habit you wish you could let go of?"
  },
  {
    ja: "最近言ってしまって、ちょっと後悔してること、どんなことだった？",
    en: "What's something you said recently that you kind of regret?"
  },
  {
    ja: "自分のことで、なかなか認められないところってどんなところ？",
    en: "What's a part of yourself that you find hard to accept?"
  },
  {
    ja: "わかってるのに繰り返してしまう失敗って、どんなこと？",
    en: "What's a mistake you keep making, even though you know better?"
  },
  {
    ja: "気にしてないふりしてるけど、本当は気にしてること、どんなこと？",
    en: "What's something you've been pretending not to care about?"
  },

  // 他者との関係・言えなかったこと（Q7–12）
  {
    ja: "誰かに言いたいけど、ずっと言えていないこと、どんなこと？",
    en: "What's something you've wanted to say to someone but never have?"
  },
  {
    ja: "気になってるのに連絡できていない人って、どんな人でなんで連絡できないの？",
    en: "Who's someone you haven't reached out to, and what's holding you back?"
  },
  {
    ja: "これだけはわかってほしいって思ってるのに伝わっていないこと、どんなこと？",
    en: "What's something you wish someone in your life truly understood about you?"
  },
  {
    ja: "本当は言いたかったのに黙ってしまったこと、どんな場面だった？",
    en: "Tell me about a time you held back when you really wanted to speak up."
  },
  {
    ja: "誰かのためにしたのに気づいてもらえなかったこと、どんなことだった？",
    en: "What's something small you did for someone that went unnoticed?"
  },
  {
    ja: "つい比べてしまう人って誰で、なんでその人と比べてしまうんだろう？",
    en: "Who do you keep comparing yourself to, and why do you think that is?"
  },

  // 本当はこうしたい・隠れた欲求（Q13–18）
  {
    ja: "こっそり望んでるけど、恥ずかしくて言えないこと、どんなこと？",
    en: "What's something you secretly want but feel embarrassed to say out loud?"
  },
  {
    ja: "なりたい自分の姿って、どんな感じ？",
    en: "What does the version of yourself you want to be look like?"
  },
  {
    ja: "もっとこうしていいって許可が出たら、どんな自分でいたい？",
    en: "What kind of person would you be if you gave yourself permission to?"
  },
  {
    ja: "こっそり諦めてしまった夢や望みって、どんなもの？",
    en: "What's a dream you've quietly let go of?"
  },
  {
    ja: "誰にも言ってないけど、自分だけのためにやってることって、どんなこと？",
    en: "What's something you do just for yourself that you never tell anyone about?"
  },
  {
    ja: "求めちゃいけない気がして、罪悪感を感じながら望んでいること、どんなこと？",
    en: "What's something you want but feel guilty for wanting?"
  },

  // 疲れ・頑張りすぎ（Q19–24）
  {
    ja: "しばらくひとりで抱えてること、どんなこと？",
    en: "What's something you've been carrying alone for a while?"
  },
  {
    ja: "ずっと果たしてきた役割や期待で、最近疲れてきてるものって、どんなもの？",
    en: "What's a role or expectation you're getting tired of living up to?"
  },
  {
    ja: "大丈夫なふりをするために、どんなことをしてる？",
    en: "What do you do to seem okay when you're actually not?"
  },
  {
    ja: "強くいなきゃって頑張ってきたけど、本当はもう疲れたなって思うこと、どんなこと？",
    en: "What's something you've been strong about that you're actually exhausted by?"
  },
  {
    ja: "言いにくくて、ずるずると許してしまっていること、どんなこと？",
    en: "What's a boundary you've let others cross because it felt easier than saying something?"
  },
  {
    ja: "人にはしてあげてるのに、自分はしてもらえてないなって思うこと、どんなこと？",
    en: "What do you do for others that you secretly wish they'd do for you too?"
  }
];

// Q25〜44: 自分を認めてあげたいこと・着地点
export const ACCEPTANCE_QUESTIONS: Question[] = [
  {
    ja: "乗り越えてきたのに、自分をあまり褒めてあげられていないこと、どんなこと？",
    en: "What's something you've been through that you don't give yourself enough credit for?"
  },
  {
    ja: "欠点だって言われてきたけど、実はちょっと好きな自分の部分って、どんなところ？",
    en: "What's a part of yourself you've been told is a flaw, but secretly kind of like?"
  },
  {
    ja: "本当はできるのに、なぜか過小評価してしまってること、どんなこと？",
    en: "What are you better at than you let on?"
  },
  {
    ja: "最近誰かに優しくしたけど誰にも言っていないこと、どんなことだった？",
    en: "What's a small act of kindness you did recently that no one knows about?"
  },
  {
    ja: "誰かのためだけにやり続けてきたけど、本当は自分のものにしたいこと、どんなこと？",
    en: "What's something you've been doing just to please others that you'd like to reclaim for yourself?"
  },
  {
    ja: "1年前の自分に一言かけてあげるとしたら、何て言ってあげたい？",
    en: "What would you tell yourself from a year ago?"
  },
  {
    ja: "あのとき怖かったけど、やってよかったなって思える選択って、どんなこと？",
    en: "What's a choice you made that felt scary at the time but turned out okay?"
  },
  {
    ja: "辛かったときに、自分を支えてくれた小さなものって、何だった？",
    en: "What's something small that got you through a tough time?"
  },
  {
    ja: "もらった言葉で、今でもたまに思い出すものって、どんな言葉？",
    en: "What's a compliment you received that you still think about?"
  },
  {
    ja: "昔は恥ずかしかったけど、今はもう受け入れられてることって、どんなこと？",
    en: "What's something you used to be ashamed of that you've made peace with?"
  },
  {
    ja: "自分でもあまり気づいていないけど、実は成長してきたなって思うところって、どんなところ？",
    en: "What's a way you've grown that you rarely acknowledge?"
  },
  {
    ja: "最近やったことで、傍から見るより実はずっと勇気がいったこと、どんなこと？",
    en: "What's something you did recently that took more courage than it looked?"
  },
  {
    ja: "あなたを大切に思っている人が、すぐに挙げてくれそうなあなたのいいところって、どんなところだと思う？",
    en: "What's a quality in yourself that the people who love you would immediately name?"
  },
  {
    ja: "時間はかかったけど、自分を許せるようになったこと、どんなこと？",
    en: "What's something you've forgiven yourself for, even if it took a while?"
  },
  {
    ja: "今の自分を作ってきた、過去の一場面って、どんな場面？",
    en: "What's a moment from your past that made you who you are today?"
  },
  {
    ja: "あまり口には出さないけど、こっそり誇りに思ってること、どんなこと？",
    en: "What's something you're quietly proud of that you don't talk about much?"
  },
  {
    ja: "うまく付き合えるようになってきた、難しい感情って、どんなもの？",
    en: "What's a difficult feeling you've learned to sit with?"
  },
  {
    ja: "誰も見ていないときに、実はすごく上手にできることって、どんなこと？",
    en: "What's something you do really well when no one's watching?"
  },
  {
    ja: "昔は自分の足を引っ張っていたけど、今はもう変わってきた自分への思い込みって、どんなもの？",
    en: "What's a belief about yourself that used to hold you back but doesn't anymore?"
  },
  {
    ja: "botたんに、一番知っておいてほしい自分のことって、どんなこと？",
    en: "What's one thing you'd want bot-tan to know about you?"
  }
];

// 互換性維持のための全体配列
export const QUESTIONS: Question[] = [...DEEP_QUESTIONS, ...ACCEPTANCE_QUESTIONS];
