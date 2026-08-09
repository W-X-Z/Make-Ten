export type Cell = number | null;

export interface Board {
  readonly cols: number;
  readonly rows: number;
  cells: Cell[]; // row-major: index = row * cols + col
}

/** 정규화된 사각형 영역 (셀 좌표, 양 끝 포함) */
export interface Rect {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

export const TARGET_SUM = 10;

/** 초기 보드에 최소한 이만큼의 합 10 사각형이 존재하도록 보정 */
const MIN_INITIAL_COMBOS = 3;
const MAX_GEN_ATTEMPTS = 100;

export type Rng = () => number;

function randomDigit(rng: Rng): number {
  return 1 + Math.floor(rng() * 9);
}

export function normalizeRect(c0: number, r0: number, c1: number, r1: number): Rect {
  return {
    c0: Math.min(c0, c1),
    r0: Math.min(r0, r1),
    c1: Math.max(c0, c1),
    r1: Math.max(r0, r1),
  };
}

export function createBoard(cols: number, rows: number, rng: Rng = Math.random): Board {
  let board: Board = { cols, rows, cells: [] };
  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    board = {
      cols,
      rows,
      cells: Array.from({ length: cols * rows }, () => randomDigit(rng)),
    };
    if (countCombos(board) >= MIN_INITIAL_COMBOS) return board;
  }
  return board;
}

/** 사각형 영역 안의 숫자 타일 인덱스 목록 (빈칸 제외) */
export function tilesInRect(board: Board, rect: Rect): number[] {
  const tiles: number[] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    for (let c = rect.c0; c <= rect.c1; c++) {
      const i = r * board.cols + c;
      if (board.cells[i] !== null) tiles.push(i);
    }
  }
  return tiles;
}

export function sumTiles(board: Board, tiles: number[]): number {
  return tiles.reduce((acc, i) => acc + (board.cells[i] ?? 0), 0);
}

export function clearTiles(board: Board, tiles: number[]): void {
  for (const i of tiles) board.cells[i] = null;
}

export function remainingTileCount(board: Board): number {
  return board.cells.filter((c) => c !== null).length;
}

/** (0,0)~(r-1,c-1) 합의 2차원 누적합 테이블 */
function prefixSums(board: Board): number[][] {
  const { cols, rows, cells } = board;
  const prefix: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      prefix[r + 1][c + 1] =
        (cells[r * cols + c] ?? 0) + prefix[r][c + 1] + prefix[r + 1][c] - prefix[r][c];
    }
  }
  return prefix;
}

/**
 * 합이 targets 중 하나인 사각형 영역이 존재하는지 검사.
 * 누적합으로 모든 사각형을 O(1)에 평가한다 (7×10 보드 기준 ~1,540개).
 */
export function hasAnyCombo(board: Board, targets: readonly number[] = [TARGET_SUM]): boolean {
  return findCombo(board, targets) !== null;
}

/** 합이 targets 중 하나인 사각형 중 가장 작은 것 하나를 반환 (힌트용) */
export function findCombo(board: Board, targets: readonly number[] = [TARGET_SUM]): Rect | null {
  const { cols, rows } = board;
  const prefix = prefixSums(board);
  const wanted = new Set(targets);
  let best: Rect | null = null;
  let bestArea = Infinity;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let r1 = r0; r1 < rows; r1++) {
      for (let c0 = 0; c0 < cols; c0++) {
        for (let c1 = c0; c1 < cols; c1++) {
          const sum =
            prefix[r1 + 1][c1 + 1] - prefix[r0][c1 + 1] - prefix[r1 + 1][c0] + prefix[r0][c0];
          if (wanted.has(sum)) {
            const area = (r1 - r0 + 1) * (c1 - c0 + 1);
            if (area < bestArea) {
              bestArea = area;
              best = { c0, r0, c1, r1 };
            }
          }
        }
      }
    }
  }
  return best;
}

export function countCombos(board: Board, target: number = TARGET_SUM, stopAt = Infinity): number {
  const { cols, rows } = board;
  const prefix = prefixSums(board);
  let count = 0;
  for (let r0 = 0; r0 < rows; r0++) {
    for (let r1 = r0; r1 < rows; r1++) {
      for (let c0 = 0; c0 < cols; c0++) {
        for (let c1 = c0; c1 < cols; c1++) {
          const sum =
            prefix[r1 + 1][c1 + 1] - prefix[r0][c1 + 1] - prefix[r1 + 1][c0] + prefix[r0][c0];
          if (sum === target) {
            count++;
            if (count >= stopAt) return count;
          }
        }
      }
    }
  }
  return count;
}

/** 사각형 둘레에 십자 방향으로 인접한 숫자 타일들 (럭키 13 폭발 범위) */
export function crossNeighborTiles(board: Board, rect: Rect): number[] {
  const out: number[] = [];
  const addIf = (r: number, c: number) => {
    if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) return;
    const i = r * board.cols + c;
    if (board.cells[i] !== null) out.push(i);
  };
  for (let c = rect.c0; c <= rect.c1; c++) {
    addIf(rect.r0 - 1, c);
    addIf(rect.r1 + 1, c);
  }
  for (let r = rect.r0; r <= rect.r1; r++) {
    addIf(r, rect.c0 - 1);
    addIf(r, rect.c1 + 1);
  }
  return out;
}
