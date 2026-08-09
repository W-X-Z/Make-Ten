/** 영구 진행 상태 (코인, 스킬 레벨, 최고 기록, 목표 선택) — localStorage 저장 */
export interface Progress {
  coins: number;
  best: number;
  skills: Record<string, number>;
  /** 마지막으로 선택한 특수 목표 합 (최대 3개) */
  targets: number[];
}

const KEY = 'make-ten:progress';
const LEGACY_BEST_KEY = 'make-ten:best';

/** 점수 → 코인 환산 비율 (5점 = 1코인) */
export function coinsForScore(score: number): number {
  return Math.floor(score / 5);
}

export function loadProgress(): Progress {
  let progress: Progress = { coins: 0, best: 0, skills: {}, targets: [17] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Progress>;
      progress = {
        coins: Number(parsed.coins) || 0,
        best: Number(parsed.best) || 0,
        skills: typeof parsed.skills === 'object' && parsed.skills ? parsed.skills : {},
        targets: Array.isArray(parsed.targets)
          ? parsed.targets.filter((t) => [13, 17, 20].includes(t)).slice(0, 3)
          : [17],
      };
    }
  } catch {
    // 손상된 저장 데이터는 초기화
  }
  // M1 시절 최고 기록 마이그레이션
  const legacyBest = Number(localStorage.getItem(LEGACY_BEST_KEY) ?? '0') || 0;
  if (legacyBest > progress.best) progress.best = legacyBest;
  return progress;
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(KEY, JSON.stringify(progress));
}
