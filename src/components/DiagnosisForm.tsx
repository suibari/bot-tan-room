import { useState, useMemo, useEffect } from 'react';
import { DEEP_QUESTIONS, ACCEPTANCE_QUESTIONS } from '@/data/questions';

type AnswerItem = { question: string; answer: string };

type Props = {
  lang: 'ja' | 'en';
  onSubmit: (answers: AnswerItem[]) => void;
  onQuestionShow?: (text: string) => void;
};

const LABELS = {
  ja: {
    next: '次へ →',
    submit: '診断する ✨',
    placeholder: '30文字以内で答えてね',
    progress: (current: number, total: number) => `${current} / ${total}`,
  },
  en: {
    next: 'Next →',
    submit: 'Diagnose ✨',
    placeholder: 'Answer in 30 chars or less',
    progress: (current: number, total: number) => `${current} / ${total}`,
  },
};

export function DiagnosisForm({ lang, onSubmit, onQuestionShow }: Props) {
  const l = LABELS[lang];

  const selectedQuestions = useMemo(() => {
    const part1 = [...DEEP_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 2);
    const part2 = [...ACCEPTANCE_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 1);
    return [...part1, ...part2];
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(['', '', '']);

  useEffect(() => {
    // 選択されたUI言語に関わらず、発話は常に日本語のテキストを使用する
    const text = selectedQuestions[currentIndex].ja;
    onQuestionShow?.(text);
  // selectedQuestions は useMemo で固定。currentIndex の変化のみ追跡
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const currentAnswer = answers[currentIndex];
  const canProceed = currentAnswer.trim().length > 0;
  const isLast = currentIndex === 2;

  const handleNext = () => {
    if (!canProceed) return;
    if (isLast) {
      onSubmit(
        selectedQuestions.map((q, i) => ({
          question: lang === 'ja' ? q.ja : q.en,
          answer: answers[i].trim(),
        }))
      );
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const q = selectedQuestions[currentIndex];

  return (
    <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* progress indicator */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block rounded-full transition-all"
              style={{
                width: i === currentIndex ? 24 : 10,
                height: 10,
                background:
                  i < currentIndex
                    ? 'var(--theme-mint)'
                    : i === currentIndex
                    ? 'var(--theme-mint)'
                    : 'rgba(15, 32, 67, 0.15)',
              }}
            />
          ))}
        </div>
        <span className="text-slate-400 text-xs font-mono font-bold">
          {l.progress(currentIndex + 1, 3)}
        </span>
      </div>

      {/* question */}
      <p className="text-slate-800 text-lg font-black leading-relaxed" style={{ minHeight: '3rem', margin: '0' }}>
        {lang === 'ja' ? q.ja : q.en}
      </p>

      {/* answer input */}
      <input
        key={currentIndex}
        type="text"
        value={currentAnswer}
        onChange={(e) =>
          setAnswers((prev) => prev.map((v, j) => (j === currentIndex ? e.target.value : v)))
        }
        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
        placeholder={l.placeholder}
        maxLength={30}
        autoFocus
        className="w-full text-slate-800 placeholder-slate-400 outline-none text-base font-semibold shadow-inner transition-all duration-200"
        style={{
          background: "rgba(255, 255, 255, 0.55)",
          border: "1.5px solid rgba(58, 155, 213, 0.25)",
          borderRadius: "9999px",
          padding: "13px 24px",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--theme-blue)';
          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(58, 155, 213, 0.15)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(58, 155, 213, 0.25)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />

      {/* next / submit button */}
      <button
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full font-black text-white text-base shadow-md tracking-wider transition-all duration-300 hover:shadow-lg hover:brightness-105 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed bg-theme-gradient"
        style={{
          borderRadius: "9999px",
          padding: "13px 24px",
        }}
      >
        {isLast ? l.submit : l.next}
      </button>
    </div>
  );
}
