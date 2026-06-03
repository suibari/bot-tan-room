// NOTE: apps/biorhythm_server/src/utilityAI.ts の複製（getUtilities のみ）。
// ChatVRM は独立した Next.js プロジェクトのため共有パッケージを直接 import できず、
// 冗長な構成になっている。共有パッケージへの移行が望ましい。

export interface SimulationState {
  hour: number;
  isWeekend: boolean;
  energy: number;
}

type UtilityFunction = (state: SimulationState) => number;

function circularGaussian(hour: number, peak: number, sigma: number): number {
  let diff = Math.abs(hour - peak);
  if (diff > 12) diff = 24 - diff;
  return Math.exp(-(diff ** 2) / (2 * sigma ** 2));
}

const sleep: UtilityFunction = (state) => {
  const nightSleepScore = circularGaussian(state.hour, 2, 3) * 100;
  const morningSleepScore = circularGaussian(state.hour, 7, 1.5) * 70;
  const daytimePenalty = circularGaussian(state.hour, 14, 4) * -50;
  const energyFactor = (100 - state.energy) * 0.8;
  return Math.max(0, nightSleepScore + morningSleepScore + daytimePenalty + energyFactor);
};

const wakeUp: UtilityFunction = (state) => {
  const morningWakeScore = circularGaussian(state.hour, 7, 1.5) * 50;
  let weekdayBonus = 0;
  if (!state.isWeekend && state.hour >= 6 && state.hour <= 8) weekdayBonus = 50;
  const energyFactor = state.energy * 0.2;
  return Math.max(0, morningWakeScore + weekdayBonus + energyFactor);
};

const study: UtilityFunction = (state) => {
  let score = 0;
  if (!state.isWeekend) score += circularGaussian(state.hour, 12, 3) * 120;
  score += circularGaussian(state.hour, 18, 2) * 40;
  if (state.isWeekend) score += circularGaussian(state.hour, 14, 3) * 40;
  if (state.energy < 30) score -= 60;
  else if (state.energy > 60) score += 20;
  return Math.max(0, score);
};

const freetime: UtilityFunction = (state) => {
  const nightGamingScore = circularGaussian(state.hour, 22, 3) * 100;
  const weekendDayScore = state.isWeekend ? circularGaussian(state.hour, 14, 4) * 70 : 0;
  const afterSchoolScore = !state.isWeekend ? circularGaussian(state.hour, 17, 2) * 60 : 0;
  const energyBonus = state.energy >= 40 ? 30 : 0;
  return Math.max(0, nightGamingScore + weekendDayScore + afterSchoolScore + energyBonus);
};

const relax: UtilityFunction = (state) => {
  const eveningRelaxScore = circularGaussian(state.hour, 19, 2.5) * 80;
  const energyFactor = state.energy < 50 ? (50 - state.energy) * 1.2 : 0;
  const weekendBonus = state.isWeekend ? 20 : 0;
  return Math.max(0, eveningRelaxScore + energyFactor + weekendBonus);
};

export type UtilityKey = 'Sleep' | 'WakeUp' | 'Study' | 'FreeTime' | 'Relax';

export function getUtilities(state: SimulationState): Record<UtilityKey, number> {
  return {
    Sleep: sleep(state),
    WakeUp: wakeUp(state),
    Study: study(state),
    FreeTime: freetime(state),
    Relax: relax(state),
  };
}
