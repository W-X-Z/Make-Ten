import {
  Board,
  Rect,
  Rng,
  TARGET_SUM,
  clearTiles,
  createBoard,
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
  rerolls: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  cols: 7,
  rows: 10,
  durationMs: 120_000,
  rerolls: 1,
};

export type Phase = 'ready' | 'playing' | 'result';

export interface ClearAttempt {
  cleared: boolean;
  sum: number;
  tiles: number[];
  points: number;
}

export class Game {
  readonly config: GameConfig;
  board: Board;
  phase: Phase = 'ready';
  score = 0;
  timeLeftMs: number;
  rerollsLeft: number;
  /** 현재 보드에 합 10 사각형이 하나라도 존재하는가 */
  combosAvailable = true;

  private rng: Rng;

  constructor(config: GameConfig = DEFAULT_CONFIG, rng: Rng = Math.random) {
    this.config = config;
    this.rng = rng;
    this.board = createBoard(config.cols, config.rows, rng);
    this.timeLeftMs = config.durationMs;
    this.rerollsLeft = config.rerolls;
    this.combosAvailable = hasAnyCombo(this.board);
  }

  start(): void {
    if (this.phase === 'ready') this.phase = 'playing';
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

  /** 드래그를 놓았을 때의 판정. 합이 10이면 제거하고 점수를 더한다. */
  attemptClear(rect: Rect): ClearAttempt {
    const miss: ClearAttempt = { cleared: false, sum: 0, tiles: [], points: 0 };
    if (this.phase !== 'playing') return miss;

    const tiles = tilesInRect(this.board, rect);
    const sum = sumTiles(this.board, tiles);
    if (sum !== TARGET_SUM) return { ...miss, sum, tiles };

    clearTiles(this.board, tiles);
    const points = scoreForClear(tiles.length);
    this.score += points;
    this.combosAvailable = hasAnyCombo(this.board);
    return { cleared: true, sum, tiles, points };
  }

  canReroll(): boolean {
    return (
      this.phase === 'playing' && this.rerollsLeft > 0 && remainingTileCount(this.board) > 0
    );
  }

  reroll(): boolean {
    if (!this.canReroll()) return false;
    this.rerollsLeft--;
    rerollBoard(this.board, this.rng);
    this.combosAvailable = hasAnyCombo(this.board);
    return true;
  }
}
