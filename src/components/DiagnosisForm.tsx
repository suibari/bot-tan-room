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
    const text = lang === 'ja' ? selectedQuestions[currentIndex].ja : selectedQuestions[currentIndex].en;
    onQuestionShow?.(text);
  // selectedQuestions は useMemo で固定。currentIndex・lang の変化のみ追跡
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, lang]);

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
    <div className="space-y-4">
      {/* progress indicator */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block rounded-full transition-all"
              style={{
                width: i === currentIndex ? 20 : 8,
                height: 8,
                background:
                  i < currentIndex
                    ? 'rgba(167,139,250,0.9)'
                    : i === currentIndex
                    ? 'rgba(167,139,250,0.9)'
                    : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
        <span className="text-white/50 text-xs font-mono">
          {l.progress(currentIndex + 1, 3)}
        </span>
      </div>

      {/* question */}
      <p className="text-white text-sm font-medium leading-relaxed min-h-[2.5rem]">
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
        className="w-full px-3 py-2 rounded-xl text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-purple-400 text-sm"
        style={{ background: 'rgba(255,255,255,0.10)' }}
      />

      {/* next / submit button */}
      <button
        onClick={handleNext}
        disabled={!canProceed}
        className="w-full py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(90deg, #667eea, #764ba2)' }}
      >
        {isLast ? l.submit : l.next}
      </button>
    </div>
  );
}
