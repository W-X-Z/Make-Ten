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
    costs: [20, 50, 110, 240, 500],
  },
  {
    id: 'pair_master',
    branch: 'score',
    name: '페어 마스터',
    desc: '두 타일로 10을 만들면 +5점',
    maxLevel: 1,
    costs: [60],
    requires: { id: 'score_boost', level: 1 },
  },
  {
    id: 'tile_bonus',
    branch: 'score',
    name: '타일 보너스',
    desc: '3타일 이상 조합의 타일당 점수 +1 / 레벨',
    maxLevel: 2,
    costs: [90, 220],
    requires: { id: 'score_boost', level: 2 },
  },
  {
    id: 'big_hunter',
    branch: 'score',
    name: '대물 사냥꾼',
    desc: '5타일 이상 조합의 점수 2배',
    maxLevel: 1,
    costs: [150],
    requires: { id: 'score_boost', level: 2 },
  },
  {
    id: 'big_hunter_2',
    branch: 'score',
    name: '대물 사냥꾼 II',
    desc: '5타일 이상 조합 배율 2배 → 3배',
    maxLevel: 1,
    costs: [400],
    requires: { id: 'big_hunter', level: 1 },
  },
  {
    id: 'first_strike',
    branch: 'score',
    name: '스타트 대시',
    desc: '시작 후 10초 동안 점수 1.5배',
    maxLevel: 1,
    costs: [150],
    requires: { id: 'tile_bonus', level: 1 },
  },
  // ── 조합 계열 (목표 선택 화면에서 고를 수 있는 숫자를 해금) ──
  {
    id: 'lucky_13',
    branch: 'combination',
    name: '럭키 13',
    desc: '목표 13 해금! 십자 폭발로 인접 타일까지 제거 (+3점/타일)',
    maxLevel: 1,
    costs: [80],
  },
  {
    id: 'cross_amp',
    branch: 'combination',
    name: '폭발 증폭',
    desc: '십자 폭발 타일당 점수 +3 → +7',
    maxLevel: 1,
    costs: [140],
    requires: { id: 'lucky_13', level: 1 },
  },
  {
    id: 'mystery_15',
    branch: 'combination',
    name: '라인 15',
    desc: '목표 15 해금! 선택 영역이 걸친 가로줄 전체 제거 (+2점/타일)',
    maxLevel: 1,
    costs: [200],
    requires: { id: 'lucky_13', level: 1 },
  },
  {
    id: 'seven_alchemy',
    branch: 'combination',
    name: '골든 연장',
    desc: '골든 타임(17) 지속 7초 → 10초',
    maxLevel: 1,
    costs: [120],
  },
  {
    id: 'double_20',
    branch: 'combination',
    name: '더블 20',
    desc: '목표 20 해금! 해당 조합 점수 3배',
    maxLevel: 1,
    costs: [250],
    requires: { id: 'lucky_13', level: 1 },
  },
  {
    id: 'crown_20',
    branch: 'combination',
    name: '킹 20',
    desc: '합 20 점수 배율 3배 → 5배',
    maxLevel: 1,
    costs: [600],
    requires: { id: 'double_20', level: 1 },
  },
  // ── 시간 계열 ──
  {
    id: 'time_extend',
    branch: 'time',
    name: '시간 연장',
    desc: '시작 시간 +5초 / 레벨',
    maxLevel: 4,
    costs: [25, 60, 140, 320],
  },
  {
    id: 'hourglass',
    branch: 'time',
    name: '모래시계',
    desc: '합 10 제거 시간 보너스 +0.3초 / 레벨 (기본 +1초에 추가)',
    maxLevel: 2,
    costs: [180, 350],
    requires: { id: 'time_extend', level: 1 },
  },
  {
    id: 'warmup',
    branch: 'time',
    name: '워밍업',
    desc: '시작 후 5초간 시간이 절반 속도로 감소',
    maxLevel: 1,
    costs: [120],
    requires: { id: 'time_extend', level: 1 },
  },
  {
    id: 'special_clock',
    branch: 'time',
    name: '특수 시계',
    desc: '특수 목표(13/15/17/20) 제거 시 +1초',
    maxLevel: 1,
    costs: [260],
    requires: { id: 'time_extend', level: 2 },
  },
  {
    id: 'last_spurt',
    branch: 'time',
    name: '라스트 스퍼트',
    desc: '마지막 15초 동안 점수 1.5배',
    maxLevel: 1,
    costs: [280],
    requires: { id: 'time_extend', level: 2 },
  },
  // ── 유틸 계열 ──
  {
    id: 'reroll_charge',
    branch: 'util',
    name: '초기화 충전',
    desc: '판당 보드 초기화 횟수 +1 / 레벨',
    maxLevel: 2,
    costs: [250, 700],
  },
  {
    id: 'reroll_rush',
    branch: 'util',
    name: '초기화 러시',
    desc: '초기화 직후 10초 동안 점수 1.3배',
    maxLevel: 1,
    costs: [160],
    requires: { id: 'reroll_charge', level: 1 },
  },
  {
    id: 'hint',
    branch: 'util',
    name: '힌트',
    desc: '5초간 입력이 없으면 조합 힌트 (Lv.2: 2.5초로 단축)',
    maxLevel: 2,
    costs: [100, 200],
  },
  {
    id: 'number_sense',
    branch: 'util',
    name: '숫자 감각',
    desc: '보드에 작은 숫자(1~5)가 더 자주 등장',
    maxLevel: 1,
    costs: [220],
  },
  {
    id: 'coin_boost',
    branch: 'util',
    name: '코인 부스트',
    desc: '판 종료 시 획득 코인 +10% / 레벨',
    maxLevel: 3,
    costs: [100, 250, 550],
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

/** 해금 상태 기준으로 목표 선택 화면에서 고를 수 있는 특수 숫자 풀 (17은 기본 제공) */
export function unlockedTargets(progress: Progress): number[] {
  const pool: number[] = [];
  if (skillLevel(progress, 'lucky_13') > 0) pool.push(13);
  if (skillLevel(progress, 'mystery_15') > 0) pool.push(15);
  pool.push(17);
  if (skillLevel(progress, 'double_20') > 0) pool.push(20);
  return pool;
}

/** 스킬 레벨 → 게임에 적용되는 효과 묶음 (specialTargets는 호출 측에서 선택값으로 채움) */
export function computePerks(progress: Progress): Perks {
  const lv = (id: string) => skillLevel(progress, id);
  return {
    ...BASE_PERKS,
    scoreMultiplier: 1 + 0.1 * lv('score_boost'),
    bigHunter: lv('big_hunter') > 0,
    bigHunterMult: lv('big_hunter_2') > 0 ? 3 : 2,
    pairBonus: lv('pair_master') > 0 ? 5 : 0,
    tileBonus: 2 + lv('tile_bonus'),
    startDash: lv('first_strike') > 0,
    extraTimeMs: 5_000 * lv('time_extend'),
    timePerClearMs: 300 * lv('hourglass'),
    warmup: lv('warmup') > 0,
    specialTimeMs: lv('special_clock') > 0 ? 1_000 : 0,
    lastSpurt: lv('last_spurt') > 0,
    resets: 1 + lv('reroll_charge'),
    resetRush: lv('reroll_rush') > 0,
    hint: lv('hint') > 0,
    hintDelayMs: lv('hint') >= 2 ? 2_500 : 5_000,
    crossPoints: lv('cross_amp') > 0 ? 7 : 3,
    goldenExtendMs: lv('seven_alchemy') > 0 ? 3_000 : 0,
    twentyMult: lv('crown_20') > 0 ? 5 : 3,
    lowBias: lv('number_sense') > 0,
    coinBonus: 1 + 0.1 * lv('coin_boost'),
    specialTargets: unlockedTargets(progress),
  };
}
