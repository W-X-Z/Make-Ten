import { Board, Rect } from '../core/board';

export interface SelectionView {
  rect: Rect;
  sum: number;
  valid: boolean;
  /** valid일 때의 강조색 (목표 합마다 다름) */
  color: string;
}

export interface FloatingText {
  col: number;
  row: number;
  ageMs: number;
  text: string;
  color?: string;
}

export interface HintView {
  rect: Rect;
  /** 0~1 펄스 위상 */
  pulse: number;
}

const COLORS = {
  emptySlot: 'rgba(255, 255, 255, 0.05)',
  tile: '#f4f6fb',
  tileText: '#232a3d',
  selectValid: '#37d67a',
  selectValidFill: 'rgba(55, 214, 122, 0.18)',
  selectDrag: '#5b8cff',
  selectDragFill: 'rgba(91, 140, 255, 0.15)',
  float: '#ffd75e',
};

const GAP_RATIO = 0.1; // 타일 크기 대비 타일 간격

export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private tileSize = 0;
  private gap = 0;
  private originX = 0;
  private originY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private cols: number,
    private rows: number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
  }

  /** 캔버스 CSS 크기에 맞춰 픽셀 크기와 보드 배치를 재계산 */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const unitW = cssW / (this.cols + GAP_RATIO * (this.cols - 1));
    const unitH = cssH / (this.rows + GAP_RATIO * (this.rows - 1));
    this.tileSize = Math.floor(Math.min(unitW, unitH));
    this.gap = Math.floor(this.tileSize * GAP_RATIO);

    const boardW = this.cols * this.tileSize + (this.cols - 1) * this.gap;
    const boardH = this.rows * this.tileSize + (this.rows - 1) * this.gap;
    this.originX = Math.floor((cssW - boardW) / 2);
    this.originY = Math.floor((cssH - boardH) / 2);
  }

  /** 캔버스 좌표 → 셀 좌표. clamp=false면 보드 밖일 때 null */
  cellFromPoint(x: number, y: number, clamp: boolean): { c: number; r: number } | null {
    const step = this.tileSize + this.gap;
    const fc = (x - this.originX) / step;
    const fr = (y - this.originY) / step;
    let c = Math.floor(fc);
    let r = Math.floor(fr);
    if (!clamp && (c < 0 || c >= this.cols || r < 0 || r >= this.rows)) return null;
    c = Math.max(0, Math.min(this.cols - 1, c));
    r = Math.max(0, Math.min(this.rows - 1, r));
    return { c, r };
  }

  render(
    board: Board,
    selection: SelectionView | null,
    floats: FloatingText[],
    hint: HintView | null = null,
  ): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    this.drawTiles(board);
    if (hint && !selection) this.drawHint(hint);
    if (selection) this.drawSelection(selection);
    this.drawFloats(floats);
  }

  private drawHint(hint: HintView): void {
    const { ctx, tileSize } = this;
    const x = this.tileX(hint.rect.c0);
    const y = this.tileY(hint.rect.r0);
    const w = this.tileX(hint.rect.c1) + tileSize - x;
    const h = this.tileY(hint.rect.r1) + tileSize - y;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45 * hint.pulse;
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.float;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, Math.max(6, tileSize * 0.18));
    ctx.stroke();
    ctx.restore();
  }

  private tileX(c: number): number {
    return this.originX + c * (this.tileSize + this.gap);
  }

  private tileY(r: number): number {
    return this.originY + r * (this.tileSize + this.gap);
  }

  private drawTiles(board: Board): void {
    const { ctx, tileSize } = this;
    const radius = Math.max(4, tileSize * 0.18);
    ctx.font = `700 ${Math.round(tileSize * 0.48)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const value = board.cells[r * this.cols + c];
        const x = this.tileX(c);
        const y = this.tileY(r);
        ctx.beginPath();
        ctx.roundRect(x, y, tileSize, tileSize, radius);
        if (value === null) {
          ctx.fillStyle = COLORS.emptySlot;
          ctx.fill();
        } else {
          ctx.fillStyle = COLORS.tile;
          ctx.fill();
          ctx.fillStyle = COLORS.tileText;
          ctx.fillText(String(value), x + tileSize / 2, y + tileSize / 2 + tileSize * 0.03);
        }
      }
    }
  }

  private drawSelection(sel: SelectionView): void {
    const { ctx, tileSize } = this;
    const x = this.tileX(sel.rect.c0);
    const y = this.tileY(sel.rect.r0);
    const w = this.tileX(sel.rect.c1) + tileSize - x;
    const h = this.tileY(sel.rect.r1) + tileSize - y;
    const stroke = sel.valid ? sel.color : COLORS.selectDrag;
    const fill = sel.valid ? hexWithAlpha(sel.color, 0.18) : COLORS.selectDragFill;

    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, w + 4, h + 4, Math.max(6, tileSize * 0.18));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // 합계 배지
    const badgeText = String(sel.sum);
    const badgeH = Math.max(22, tileSize * 0.55);
    ctx.font = `700 ${Math.round(badgeH * 0.6)}px system-ui, sans-serif`;
    const badgeW = Math.max(badgeH, ctx.measureText(badgeText).width + badgeH * 0.6);
    const bx = x + w / 2 - badgeW / 2;
    const by = y - badgeH - 6 < 0 ? y + h + 6 : y - badgeH - 6;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx + badgeW / 2, by + badgeH / 2 + 1);
  }

  private drawFloats(floats: FloatingText[]): void {
    const { ctx, tileSize } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      const progress = Math.min(1, f.ageMs / 800);
      const x = this.tileX(f.col) + tileSize / 2;
      const y = this.tileY(f.row) + tileSize / 2 - progress * tileSize * 0.9;
      ctx.globalAlpha = 1 - progress;
      ctx.font = `800 ${Math.round(tileSize * 0.5)}px system-ui, sans-serif`;
      ctx.fillStyle = f.color ?? COLORS.float;
      ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    }
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
