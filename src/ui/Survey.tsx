import { useState } from 'react';

interface Answers {
  mastery: number | null;
  curiosity: number | null;
  challenge: number | null;
}

interface SurveyProps {
  onDone: (answers: Answers) => void;
  onSkip: () => void;
}

/**
 * クリア直後の 3 問。PXI の熟達・好奇心・難しさを、1 画面 1 問・5 段階に縮めたもの。
 * 答えなくてもすぐ次へ進める（「スキップ」）。途中でやめても答えたぶんは残す。
 */
const QUESTIONS: Array<{
  key: keyof Answers;
  text: string;
  labels: [string, string];
}> = [
  { key: 'mastery', text: 'じぶんの ちからで とけた かんじ？', labels: ['ぜんぜん', 'とても'] },
  { key: 'curiosity', text: 'つぎの めんも やってみたい？', labels: ['ぜんぜん', 'とても'] },
  { key: 'challenge', text: 'むずかしさは どうだった？', labels: ['かんたん', 'むずかしい'] },
];

export function Survey({ onDone, onSkip }: SurveyProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    mastery: null,
    curiosity: null,
    challenge: null,
  });

  const q = QUESTIONS[step];

  const pick = (value: number) => {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (step + 1 >= QUESTIONS.length) onDone(next);
    else setStep(step + 1);
  };

  const skip = () => {
    // 1 問でも答えていれば残す
    if (answers.mastery !== null || answers.curiosity !== null || answers.challenge !== null) {
      onDone(answers);
    } else {
      onSkip();
    }
  };

  return (
    <div className="survey" role="group" aria-label="かんそう">
      <p className="survey-q">
        {q.text} <span className="survey-step">{step + 1}/{QUESTIONS.length}</span>
      </p>
      <div className="survey-opts">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} type="button" className="survey-opt" onClick={() => pick(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="survey-ends">
        <span>{q.labels[0]}</span>
        <span>{q.labels[1]}</span>
      </div>
      <button type="button" className="sheet-link survey-skip" onClick={skip}>
        スキップ
      </button>
    </div>
  );
}
