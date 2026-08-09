import {
  Board,
  Rect,
  Rng,
  TARGET_SUM,
  clearTiles,
  createBoard,
  crossNeighborTiles,
  findCombo,
  hasAnyCombo,
  sumTiles,
  tilesInRect,
} from './board';
import { scoreForClear } from './scoring';

export interface GameConfig {
  cols: number;
  rows: number;
  durationMs: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  cols: 7,
  rows: 10,
  durationMs: 30_000,
};

/** 스킬트리 해금이 게임 한 판에 적용되는 효과 묶음 */
export interface Perks {
  scoreMultiplier: number;
  /** 5타일 이상 조합 배율 적용 여부 (대물 사냥꾼) */
  bigHunter: boolean;
  /** 대물 사냥꾼 배율 (기본 2, II 해금 시 3) */
  bigHunterMult: number;
  /** 두 타일로 정확히 10을 만들 때 추가 점수 (페어 마스터) */
  pairBonus: number;
  /** 3타일 이상 조합의 타일당 보너스 점수 (기본 2) */
  tileBonus: number;
  /** 시작 후 10초 동안 점수 1.5배 (스타트 대시) */
  startDash: boolean;
  extraTimeMs: number;
  /** 합 10 제거 시 기본 +1초에 더해지는 추가 시간 (모래시계) */
  timePerClearMs: number;
  /** 시작 후 5초간 시간이 절반 속도로 감소 (워밍업) */
  warmup: boolean;
  /** 특수 목표 제거 시 추가 시간 (특수 시계) */
  specialTimeMs: number;
  /** 마지막 15초 점수 1.5배 */
  lastSpurt: boolean;
  /** 판당 보드 초기화 가능 횟수 */
  resets: number;
  /** 초기화 직후 10초 점수 1.3배 */
  resetRush: boolean;
  hint: boolean;
  /** 힌트가 뜨기까지의 무입력 시간 */
  hintDelayMs: number;
  /** 십자 폭발 타일당 점수 (기본 3, 증폭 시 7) */
  crossPoints: number;
  /** 17 변환된 7 하나당 점수 (7의 연금술) */
  sevenPoints: number;
  /** 합 20 점수 배율 (기본 3, 킹 20 시 5) */
  twentyMult: number;
  /** 보드 생성 시 작은 숫자 편향 (숫자 감각) */
  lowBias: boolean;
  /** 판 종료 시 코인 배율 (코인 부스트) */
  coinBonus: number;
  /** 이 판에서 사용할 특수 목표 합 (선택 화면에서 확정, 최대 3개) */
  specialTargets: number[];
}

export const BASE_PERKS: Perks = {
  scoreMultiplier: 1,
  bigHunter: false,
  bigHunterMult: 2,
  pairBonus: 0,
  tileBonus: 2,
  startDash: false,
  extraTimeMs: 0,
  timePerClearMs: 0,
  warmup: false,
  specialTimeMs: 0,
  lastSpurt: false,
  resets: 1,
  resetRush: false,
  hint: false,
  hintDelayMs: 5_000,
  crossPoints: 3,
  sevenPoints: 0,
  twentyMult: 3,
  lowBias: false,
  coinBonus: 1,
  specialTargets: [],
};

const LAST_SPURT_WINDOW_MS = 15_000;
const RESET_RUSH_WINDOW_MS = 10_000;
const START_DASH_WINDOW_MS = 10_000;
const WARMUP_WINDOW_MS = 5_000;
const WARMUP_FACTOR = 0.5;
/** 합 10 제거 시 기본 시간 보너스 */
const TIME_PER_TEN_MS = 1_000;
const MYSTERY_TIME_MS = 5_000;
const BIG_HUNTER_MIN_TILES = 5;

export type Phase = 'ready' | 'playing' | 'result';

export type MysteryReward = 'triple' | 'time' | 'boom' | null;

export interface ClearAttempt {
  cleared: boolean;
  sum: number;
  tiles: number[];
  /** 십자 폭발(13 또는 미스터리 boom)로 추가 제거된 타일 */
  extraTiles: number[];
  points: number;
  timeBonusMs: number;
  /** 17 효과로 1이 된 7의 개수 */
  convertedSevens: number;
  /** 미스터리 15의 랜덤 보상 */
  mystery: MysteryReward;
  /** 이번 제거로 조합이 고갈되어 보드가 자동 초기화됐는가 */
  boardReset: boolean;
}

const MISS: ClearAttempt = {
  cleared: false,
  sum: 0,
  tiles: [],
  extraTiles: [],
  points: 0,
  timeBonusMs: 0,
  convertedSevens: 0,
  mystery: null,
  boardReset: false,
};

export class Game {
  readonly config: GameConfig;
  readonly perks: Perks;
  /** 이 판에서 제거가 성립하는 목표 합 목록 */
  readonly targets: number[];
  readonly durationMs: number;

  board: Board;
  phase: Phase = 'ready';
  score = 0;
  timeLeftMs: number;
  resetsLeft: number;
  combosAvailable = true;

  private elapsedMs = 0;
  /** 리셋 러시가 유지되는 timeLeftMs 하한 (이 값보다 클 때 활성) */
  private resetRushFloor = Infinity;
  private rng: Rng;

  constructor(perks: Perks = BASE_PERKS, config: GameConfig = DEFAULT_CONFIG, rng: Rng = Math.random) {
    this.config = config;
    this.perks = perks;
    this.targets = [TARGET_SUM, ...perks.specialTargets].sort((a, b) => a - b);
    this.rng = rng;
    this.board = createBoard(config.cols, config.rows, rng, perks.lowBias);
    this.durationMs = config.durationMs + perks.extraTimeMs;
    this.timeLeftMs = this.durationMs;
    this.resetsLeft = perks.resets;
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
  }

  start(): void {
    if (this.phase === 'ready') this.phase = 'playing';
  }

  /** 종료 버튼: 즉시 결과 화면으로 (획득 점수는 유지) */
  end(): void {
    if (this.phase === 'playing') {
      this.timeLeftMs = 0;
      this.phase = 'result';
    }
  }

  /** 매 프레임 호출. 시간이 다 되면 result로 전이한다. */
  tick(dtMs: number): void {
    if (this.phase !== 'playing') return;
    const warmupActive = this.perks.warmup && this.elapsedMs < WARMUP_WINDOW_MS;
    this.elapsedMs += dtMs;
    this.timeLeftMs -= warmupActive ? dtMs * WARMUP_FACTOR : dtMs;
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      this.phase = 'result';
    }
  }

  /** 현재 시점의 점수 배율 (스킬 효과 합성) */
  currentMultiplier(): number {
    let mult = this.perks.scoreMultiplier;
    if (this.perks.startDash && this.elapsedMs <= START_DASH_WINDOW_MS) mult *= 1.5;
    if (this.perks.lastSpurt && this.timeLeftMs <= LAST_SPURT_WINDOW_MS) mult *= 1.5;
    if (this.resetRushActive()) mult *= 1.3;
    return mult;
  }

  resetRushActive(): boolean {
    return this.perks.resetRush && this.timeLeftMs > this.resetRushFloor;
  }

  /** 드래그를 놓았을 때의 판정. 합이 목표 합이면 제거하고 점수를 더한다. */
  attemptClear(rect: Rect): ClearAttempt {
    if (this.phase !== 'playing') return MISS;

    const tiles = tilesInRect(this.board, rect);
    const sum = sumTiles(this.board, tiles);
    if (tiles.length === 0 || !this.targets.includes(sum)) {
      return { ...MISS, sum, tiles };
    }

    // 특수 효과 준비
    let mystery: MysteryReward = null;
    let extraTiles: number[] = [];
    if (sum === 13) {
      extraTiles = crossNeighborTiles(this.board, rect);
    } else if (sum === 15) {
      const roll = this.rng();
      mystery = roll < 1 / 3 ? 'triple' : roll < 2 / 3 ? 'time' : 'boom';
      if (mystery === 'boom') extraTiles = crossNeighborTiles(this.board, rect);
    }

    clearTiles(this.board, tiles);
    clearTiles(this.board, extraTiles);

    // 17: 보드의 모든 7이 1로 변환 (새 조합 재료 생성)
    let convertedSevens = 0;
    if (sum === 17) {
      this.board.cells = this.board.cells.map((v) => {
        if (v === 7) {
          convertedSevens++;
          return 1;
        }
        return v;
      });
    }

    let base = scoreForClear(tiles.length, this.perks.tileBonus);
    if (sum === TARGET_SUM && tiles.length === 2) base += this.perks.pairBonus;
    if (this.perks.bigHunter && tiles.length >= BIG_HUNTER_MIN_TILES) {
      base *= this.perks.bigHunterMult;
    }
    base += extraTiles.length * this.perks.crossPoints;
    base += convertedSevens * this.perks.sevenPoints;
    if (sum === 20) base *= this.perks.twentyMult;
    if (mystery === 'triple') base *= 3;
    const points = Math.round(base * this.currentMultiplier());
    this.score += points;

    // 시간 보너스: 합 10은 기본 +1초(+모래시계), 특수 목표는 특수 시계 스킬
    let timeBonusMs = 0;
    if (sum === TARGET_SUM) {
      timeBonusMs = TIME_PER_TEN_MS + this.perks.timePerClearMs;
    } else {
      timeBonusMs = this.perks.specialTimeMs;
    }
    if (mystery === 'time') timeBonusMs += MYSTERY_TIME_MS;
    this.timeLeftMs += timeBonusMs;

    // 조합 고갈 → 보드 전체 자동 초기화
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
    let boardReset = false;
    if (!this.combosAvailable) {
      this.regenerateBoard();
      boardReset = true;
    }

    return {
      cleared: true,
      sum,
      tiles,
      extraTiles,
      points,
      timeBonusMs,
      convertedSevens,
      mystery,
      boardReset,
    };
  }

  canReset(): boolean {
    return this.phase === 'playing' && this.resetsLeft > 0;
  }

  /** 수동 초기화: 보드 전체를 새로 생성 (횟수 소모) */
  reset(): boolean {
    if (!this.canReset()) return false;
    this.resetsLeft--;
    this.regenerateBoard();
    if (this.perks.resetRush) {
      this.resetRushFloor = this.timeLeftMs - RESET_RUSH_WINDOW_MS;
    }
    return true;
  }

  private regenerateBoard(): void {
    this.board = createBoard(this.config.cols, this.config.rows, this.rng, this.perks.lowBias);
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
  }

  /** 힌트 스킬용: 현재 보드에서 성립 가능한 가장 작은 조합 */
  findHintCombo(): Rect | null {
    return findCombo(this.board, this.targets);
  }
}
