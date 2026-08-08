import { BASE_PERKS, Perks } from '../core/game';
import { Progress } from './progress';

export type BranchId = 'score' | 'combination' | 'time' | 'util';

export interface Branch {
  id: BranchId;
  name: string;
  color: string;
}

export const BRANCHES: Branch[] = [
  { id: 'score', name: '배점', color: '#ffd75e' },
  { id: 'combination', name: '조합', color: '#b06cff' },
  { id: 'time', name: '시간', color: '#4dd6d2' },
  { id: 'util', name: '유틸', color: '#5b8cff' },
];

export interface SkillDef {
  id: string;
  branch: BranchId;
  name: string;
  desc: string;
  maxLevel: number;
  /** 레벨별 해금 비용 (코인), 길이 = maxLevel */
  costs: number[];
  /** 선행 스킬 조건 */
  requires?: { id: string; level: number };
}

export const SKILLS: SkillDef[] = [
  // ── 배점 계열 ──
  {
    id: 'score_boost',
    branch: 'score',
    name: '점수 강화',
    desc: '모든 획득 점수 +10% / 레벨',
    maxLevel: 5,
    costs: [30, 80, 180, 400, 900],
  },
  {
    id: 'big_hunter',
    branch: 'score',
    name: '대물 사냥꾼',
    desc: '5타일 이상 조합의 점수 2배',
    maxLevel: 1,
    costs: [300],
    requires: { id: 'score_boost', level: 2 },
  },
  // ── 조합 계열 ──
  {
    id: 'lucky_13',
    branch: 'combination',
    name: '럭키 13',
    desc: '합 13도 제거 가능! 십자 폭발로 인접 타일까지 제거 (+3점/타일)',
    maxLevel: 1,
    costs: [200],
  },
  {
    id: 'time_17',
    branch: 'combination',
    name: '타임 17',
    desc: '합 17도 제거 가능! 성공 시 시간 +3초',
    maxLevel: 1,
    costs: [350],
    requires: { id: 'lucky_13', level: 1 },
  },
  {
    id: 'double_20',
    branch: 'combination',
    name: '더블 20',
    desc: '합 20도 제거 가능! 해당 조합 점수 3배',
    maxLevel: 1,
    costs: [500],
    requires: { id: 'time_17', level: 1 },
  },
  // ── 시간 계열 ──
  {
    id: 'time_extend',
    branch: 'time',
    name: '시간 연장',
    desc: '시작 시간 +10초 / 레벨',
    maxLevel: 3,
    costs: [60, 150, 400],
  },
  {
    id: 'hourglass',
    branch: 'time',
    name: '모래시계',
    desc: '제거 성공 시마다 시간 +0.3초',
    maxLevel: 1,
    costs: [400],
    requires: { id: 'time_extend', level: 1 },
  },
  {
    id: 'last_spurt',
    branch: 'time',
    name: '라스트 스퍼트',
    desc: '마지막 15초 동안 점수 1.5배',
    maxLevel: 1,
    costs: [600],
    requires: { id: 'time_extend', level: 2 },
  },
  // ── 유틸 계열 ──
  {
    id: 'reroll_charge',
    branch: 'util',
    name: '리롤 충전',
    desc: '판당 리롤 횟수 +1 / 레벨',
    maxLevel: 2,
    costs: [600, 1600],
  },
  {
    id: 'reroll_rush',
    branch: 'util',
    name: '리롤 러시',
    desc: '리롤 직후 10초 동안 점수 1.3배',
    maxLevel: 1,
    costs: [350],
    requires: { id: 'reroll_charge', level: 1 },
  },
  {
    id: 'hint',
    branch: 'util',
    name: '힌트',
    desc: '5초간 입력이 없으면 가능한 조합 하나를 알려줌',
    maxLevel: 1,
    costs: [250],
  },
];

export function skillLevel(progress: Progress, id: string): number {
  return progress.skills[id] ?? 0;
}

export type BuyState = 'ok' | 'maxed' | 'locked' | 'poor';

export function buyState(progress: Progress, def: SkillDef): BuyState {
  const level = skillLevel(progress, def.id);
  if (level >= def.maxLevel) return 'maxed';
  if (def.requires && skillLevel(progress, def.requires.id) < def.requires.level) return 'locked';
  if (progress.coins < def.costs[level]) return 'poor';
  return 'ok';
}

/** 구매 시도. 성공하면 progress를 변경하고 true */
export function buySkill(progress: Progress, def: SkillDef): boolean {
  if (buyState(progress, def) !== 'ok') return false;
  const level = skillLevel(progress, def.id);
  progress.coins -= def.costs[level];
  progress.skills[def.id] = level + 1;
  return true;
}

/** 스킬 레벨 → 게임에 적용되는 효과 묶음 */
export function computePerks(progress: Progress): Perks {
  const lv = (id: string) => skillLevel(progress, id);
  const specialTargets: number[] = [];
  if (lv('lucky_13') > 0) specialTargets.push(13);
  if (lv('time_17') > 0) specialTargets.push(17);
  if (lv('double_20') > 0) specialTargets.push(20);
  return {
    ...BASE_PERKS,
    scoreMultiplier: 1 + 0.1 * lv('score_boost'),
    bigHunter: lv('big_hunter') > 0,
    extraTimeMs: 10_000 * lv('time_extend'),
    timePerClearMs: lv('hourglass') > 0 ? 300 : 0,
    lastSpurt: lv('last_spurt') > 0,
    rerolls: 1 + lv('reroll_charge'),
    rerollRush: lv('reroll_rush') > 0,
    hint: lv('hint') > 0,
    specialTargets,
  };
}
