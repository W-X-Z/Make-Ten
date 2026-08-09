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
  remainingTileCount,
  rerollBoard,
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
  /** 5타일 이상 조합 점수 2배 */
  bigHunter: boolean;
  extraTimeMs: number;
  /** 제거 성공마다 추가되는 시간 (모래시계) */
  timePerClearMs: number;
  /** 마지막 15초 점수 1.5배 */
  lastSpurt: boolean;
  rerolls: number;
  /** 리롤 직후 10초 점수 1.3배 */
  rerollRush: boolean;
  hint: boolean;
  /** 해금된 특수 목표 합 (13, 17, 20) */
  specialTargets: number[];
}

export const BASE_PERKS: Perks = {
  scoreMultiplier: 1,
  bigHunter: false,
  extraTimeMs: 0,
  timePerClearMs: 0,
  lastSpurt: false,
  rerolls: 1,
  rerollRush: false,
  hint: false,
  specialTargets: [],
};

const LAST_SPURT_WINDOW_MS = 15_000;
const REROLL_RUSH_WINDOW_MS = 10_000;
const TIME_17_BONUS_MS = 3_000;
const CROSS_EXPLOSION_POINTS = 3;
const BIG_HUNTER_MIN_TILES = 5;

export type Phase = 'ready' | 'playing' | 'result';

export interface ClearAttempt {
  cleared: boolean;
  sum: number;
  tiles: number[];
  /** 럭키 13 십자 폭발로 추가 제거된 타일 */
  extraTiles: number[];
  points: number;
  timeBonusMs: number;
}

const MISS: ClearAttempt = { cleared: false, sum: 0, tiles: [], extraTiles: [], points: 0, timeBonusMs: 0 };

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
  rerollsLeft: number;
  combosAvailable = true;

  /** 리롤 러시가 유지되는 timeLeftMs 하한 (이 값보다 클 때 활성) */
  private rerollRushFloor = Infinity;
  private rng: Rng;

  constructor(perks: Perks = BASE_PERKS, config: GameConfig = DEFAULT_CONFIG, rng: Rng = Math.random) {
    this.config = config;
    this.perks = perks;
    this.targets = [TARGET_SUM, ...perks.specialTargets];
    this.rng = rng;
    this.board = createBoard(config.cols, config.rows, rng);
    this.durationMs = config.durationMs + perks.extraTimeMs;
    this.timeLeftMs = this.durationMs;
    this.rerollsLeft = perks.rerolls;
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
    this.timeLeftMs -= dtMs;
    if (this.timeLeftMs <= 0) {
      this.timeLeftMs = 0;
      this.phase = 'result';
    }
  }

  /** 현재 시점의 점수 배율 (스킬 효과 합성) */
  currentMultiplier(): number {
    let mult = this.perks.scoreMultiplier;
    if (this.perks.lastSpurt && this.timeLeftMs <= LAST_SPURT_WINDOW_MS) mult *= 1.5;
    if (this.rerollRushActive()) mult *= 1.3;
    return mult;
  }

  rerollRushActive(): boolean {
    return this.perks.rerollRush && this.timeLeftMs > this.rerollRushFloor;
  }

  /** 드래그를 놓았을 때의 판정. 합이 목표 합이면 제거하고 점수를 더한다. */
  attemptClear(rect: Rect): ClearAttempt {
    if (this.phase !== 'playing') return MISS;

    const tiles = tilesInRect(this.board, rect);
    const sum = sumTiles(this.board, tiles);
    if (tiles.length === 0 || !this.targets.includes(sum)) {
      return { ...MISS, sum, tiles };
    }

    // 럭키 13: 십자 폭발
    const extraTiles = sum === 13 ? crossNeighborTiles(this.board, rect) : [];
    clearTiles(this.board, tiles);
    clearTiles(this.board, extraTiles);

    let base = scoreForClear(tiles.length);
    if (this.perks.bigHunter && tiles.length >= BIG_HUNTER_MIN_TILES) base *= 2;
    base += extraTiles.length * CROSS_EXPLOSION_POINTS;
    if (sum === 20) base *= 3;
    const points = Math.round(base * this.currentMultiplier());
    this.score += points;

    // 타임 17 + 모래시계
    let timeBonusMs = this.perks.timePerClearMs;
    if (sum === 17) timeBonusMs += TIME_17_BONUS_MS;
    if (timeBonusMs > 0) {
      this.timeLeftMs = Math.min(this.durationMs, this.timeLeftMs + timeBonusMs);
    }

    this.combosAvailable = hasAnyCombo(this.board, this.targets);
    return { cleared: true, sum, tiles, extraTiles, points, timeBonusMs };
  }

  canReroll(): boolean {
    return this.phase === 'playing' && this.rerollsLeft > 0 && remainingTileCount(this.board) > 0;
  }

  reroll(): boolean {
    if (!this.canReroll()) return false;
    this.rerollsLeft--;
    rerollBoard(this.board, this.targets, this.rng);
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
    if (this.perks.rerollRush) {
      this.rerollRushFloor = this.timeLeftMs - REROLL_RUSH_WINDOW_MS;
    }
    return true;
  }

  /** 힌트 스킬용: 현재 보드에서 성립 가능한 가장 작은 조합 */
  findHintCombo(): Rect | null {
    return findCombo(this.board, this.targets);
  }
}
