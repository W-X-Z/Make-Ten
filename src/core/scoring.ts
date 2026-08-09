/**
 * 합 10 성립 시 점수: 기본 10점 + 3타일 이상 조합이면 타일당 보너스.
 * tileBonusPerTile 기본 2점, 타일 보너스 스킬로 증가.
 */
export function scoreForClear(tileCount: number, tileBonusPerTile = 2): number {
  let score = 10;
  if (tileCount >= 3) score += tileCount * tileBonusPerTile;
  return score;
}
