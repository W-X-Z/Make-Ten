/** 합 10 성립 시 점수: 기본 10점 + 3타일 이상 조합이면 타일당 +2점 */
export function scoreForClear(tileCount: number): number {
  let score = 10;
  if (tileCount >= 3) score += tileCount * 2;
  return score;
}
