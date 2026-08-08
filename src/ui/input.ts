export interface CellPoint {
  c: number;
  r: number;
}

export interface PointerCallbacks {
  /** 캔버스 좌표 → 셀. clamp=false면 보드 밖일 때 null */
  toCell(x: number, y: number, clamp: boolean): CellPoint | null;
  onDragStart(cell: CellPoint): void;
  onDragMove(cell: CellPoint): void;
  onDragEnd(): void;
  onDragCancel(): void;
}

/** 캔버스에 마우스/터치 공용 드래그 입력을 연결한다 */
export function attachPointerInput(canvas: HTMLCanvasElement, cb: PointerCallbacks): void {
  let activePointer: number | null = null;

  const localPoint = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (activePointer !== null) return;
    const { x, y } = localPoint(e);
    const cell = cb.toCell(x, y, false);
    if (!cell) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    cb.onDragStart(cell);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const { x, y } = localPoint(e);
    const cell = cb.toCell(x, y, true);
    if (cell) cb.onDragMove(cell);
    e.preventDefault();
  });

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (cancelled) cb.onDragCancel();
    else cb.onDragEnd();
  };

  canvas.addEventListener('pointerup', (e) => finish(e, false));
  canvas.addEventListener('pointercancel', (e) => finish(e, true));
}
