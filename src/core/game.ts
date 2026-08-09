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
  /** 5타일 이상 조합 점수 2배 */
  bigHunter: boolean;
  extraTimeMs: number;
  /** 합 10 제거 시 기본 +1초에 더해지는 추가 시간 (모래시계) */
  timePerClearMs: number;
  /** 마지막 15초 점수 1.5배 */
  lastSpurt: boolean;
  /** 판당 보드 초기화 가능 횟수 */
  resets: number;
  /** 초기화 직후 10초 점수 1.3배 */
  resetRush: boolean;
  hint: boolean;
  /** 이 판에서 사용할 특수 목표 합 (선택 화면에서 확정, 최대 3개) */
  specialTargets: number[];
}

export const BASE_PERKS: Perks = {
  scoreMultiplier: 1,
  bigHunter: false,
  extraTimeMs: 0,
  timePerClearMs: 0,
  lastSpurt: false,
  resets: 1,
  resetRush: false,
  hint: false,
  specialTargets: [],
};

const LAST_SPURT_WINDOW_MS = 15_000;
const RESET_RUSH_WINDOW_MS = 10_000;
/** 합 10 제거 시 기본 시간 보너스 */
const TIME_PER_TEN_MS = 1_000;
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
  /** 17 효과로 1이 된 7의 개수 */
  convertedSevens: number;
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

  /** 리셋 러시가 유지되는 timeLeftMs 하한 (이 값보다 클 때 활성) */
  private resetRushFloor = Infinity;
  private rng: Rng;

  constructor(perks: Perks = BASE_PERKS, config: GameConfig = DEFAULT_CONFIG, rng: Rng = Math.random) {
    this.config = config;
    this.perks = perks;
    this.targets = [TARGET_SUM, ...perks.specialTargets].sort((a, b) => a - b);
    this.rng = rng;
    this.board = createBoard(config.cols, config.rows, rng);
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

    // 럭키 13: 십자 폭발
    const extraTiles = sum === 13 ? crossNeighborTiles(this.board, rect) : [];
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

    let base = scoreForClear(tiles.length);
    if (this.perks.bigHunter && tiles.length >= BIG_HUNTER_MIN_TILES) base *= 2;
    base += extraTiles.length * CROSS_EXPLOSION_POINTS;
    if (sum === 20) base *= 3;
    const points = Math.round(base * this.currentMultiplier());
    this.score += points;

    // 합 10 제거는 기본 +1초, 모래시계 스킬만큼 추가
    let timeBonusMs = 0;
    if (sum === TARGET_SUM) {
      timeBonusMs = TIME_PER_TEN_MS + this.perks.timePerClearMs;
      this.timeLeftMs += timeBonusMs;
    }

    // 조합 고갈 → 보드 전체 자동 초기화
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
    let boardReset = false;
    if (!this.combosAvailable) {
      this.regenerateBoard();
      boardReset = true;
    }

    return { cleared: true, sum, tiles, extraTiles, points, timeBonusMs, convertedSevens, boardReset };
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
    this.board = createBoard(this.config.cols, this.config.rows, this.rng);
    this.combosAvailable = hasAnyCombo(this.board, this.targets);
  }

  /** 힌트 스킬용: 현재 보드에서 성립 가능한 가장 작은 조합 */
  findHintCombo(): Rect | null {
    return findCombo(this.board, this.targets);
  }
}
