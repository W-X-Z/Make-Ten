import { TARGET_SUM, normalizeRect, sumTiles, tilesInRect } from './core/board';
import { DEFAULT_CONFIG, Game } from './core/game';
import { attachPointerInput, CellPoint } from './ui/input';
import { BoardRenderer, FloatingText, SelectionView } from './ui/renderer';

const BEST_SCORE_KEY = 'make-ten:best';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const scoreEl = $('score');
const timeEl = $('time');
const timeBarEl = $('time-bar');
const rerollBtn = $<HTMLButtonElement>('reroll-btn');
const rerollCountEl = $('reroll-count');
const noComboEl = document.createElement('div');
noComboEl.id = 'no-combo-hint';
noComboEl.className = 'hidden';
$('board-wrap').appendChild(noComboEl);

const startOverlay = $('start-overlay');
const resultOverlay = $('result-overlay');
const startBtn = $<HTMLButtonElement>('start-btn');
const retryBtn = $<HTMLButtonElement>('retry-btn');
const resultScoreEl = $('result-score');
const resultBestEl = $('result-best');
const bestBoxStartEl = $('best-box-start');

const canvas = $<HTMLCanvasElement>('board');
const renderer = new BoardRenderer(canvas, DEFAULT_CONFIG.cols, DEFAULT_CONFIG.rows);

let game = new Game();
let dragAnchor: CellPoint | null = null;
let selection: SelectionView | null = null;
let floats: FloatingText[] = [];
let resultShown = false;

function loadBest(): number {
  return Number(localStorage.getItem(BEST_SCORE_KEY) ?? '0') || 0;
}

function saveBest(score: number): boolean {
  if (score > loadBest()) {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
    return true;
  }
  return false;
}

function updateSelection(current: CellPoint): void {
  if (!dragAnchor) return;
  const rect = normalizeRect(dragAnchor.c, dragAnchor.r, current.c, current.r);
  const tiles = tilesInRect(game.board, rect);
  const sum = sumTiles(game.board, tiles);
  selection = { rect, sum, valid: sum === TARGET_SUM };
}

attachPointerInput(canvas, {
  toCell: (x, y, clamp) => renderer.cellFromPoint(x, y, clamp),
  onDragStart(cell) {
    if (game.phase !== 'playing') return;
    dragAnchor = cell;
    updateSelection(cell);
  },
  onDragMove(cell) {
    updateSelection(cell);
  },
  onDragEnd() {
    if (dragAnchor && selection && game.phase === 'playing') {
      const result = game.attemptClear(selection.rect);
      if (result.cleared) {
        const centerC = (selection.rect.c0 + selection.rect.c1) / 2;
        const centerR = (selection.rect.r0 + selection.rect.r1) / 2;
        floats.push({ col: centerC, row: centerR, ageMs: 0, text: `+${result.points}` });
        navigator.vibrate?.(30);
        updateHud();
      }
    }
    dragAnchor = null;
    selection = null;
  },
  onDragCancel() {
    dragAnchor = null;
    selection = null;
  },
});

function updateHud(): void {
  scoreEl.textContent = String(game.score);

  const seconds = Math.ceil(game.timeLeftMs / 1000);
  timeEl.textContent = String(seconds);
  const ratio = game.timeLeftMs / game.config.durationMs;
  timeBarEl.style.width = `${ratio * 100}%`;
  timeBarEl.classList.toggle('warning', game.phase === 'playing' && seconds <= 10);

  rerollCountEl.textContent = `×${game.rerollsLeft}`;
  rerollBtn.disabled = !game.canReroll();
  const urgent = game.phase === 'playing' && !game.combosAvailable;
  rerollBtn.classList.toggle('pulse', urgent && game.canReroll());
  noComboEl.textContent = '만들 수 있는 조합이 없어요!';
  noComboEl.classList.toggle('hidden', !urgent);
}

function showResult(): void {
  resultShown = true;
  const isNewBest = saveBest(game.score);
  resultScoreEl.textContent = String(game.score);
  resultBestEl.textContent = isNewBest
    ? '🎉 최고 기록 갱신!'
    : `최고 기록 ${loadBest()}점`;
  resultOverlay.classList.remove('hidden');
}

function startNewGame(): void {
  game = new Game();
  floats = [];
  dragAnchor = null;
  selection = null;
  resultShown = false;
  startOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  game.start();
  updateHud();
}

startBtn.addEventListener('click', startNewGame);
retryBtn.addEventListener('click', startNewGame);

rerollBtn.addEventListener('click', () => {
  if (game.reroll()) {
    navigator.vibrate?.(15);
    dragAnchor = null;
    selection = null;
    updateHud();
  }
});

const best = loadBest();
bestBoxStartEl.textContent = best > 0 ? `최고 기록 ${best}점` : '';

function handleResize(): void {
  renderer.resize();
}
window.addEventListener('resize', handleResize);
new ResizeObserver(handleResize).observe(canvas);
handleResize();
updateHud();

let lastTs = performance.now();
function frame(ts: number): void {
  const dt = Math.min(100, ts - lastTs);
  lastTs = ts;

  const wasPlaying = game.phase === 'playing';
  game.tick(dt);
  if (wasPlaying) updateHudTime();
  if (game.phase === 'result' && !resultShown) {
    updateHud();
    showResult();
  }

  for (const f of floats) f.ageMs += dt;
  floats = floats.filter((f) => f.ageMs < 800);

  renderer.render(game.board, selection, floats);
  requestAnimationFrame(frame);
}

/** 매 프레임 전체 HUD를 갱신할 필요는 없어 시간 표시만 갱신 */
function updateHudTime(): void {
  const seconds = Math.ceil(game.timeLeftMs / 1000);
  if (timeEl.textContent !== String(seconds)) {
    timeEl.textContent = String(seconds);
    timeBarEl.classList.toggle('warning', seconds <= 10);
  }
  timeBarEl.style.width = `${(game.timeLeftMs / game.config.durationMs) * 100}%`;
}

requestAnimationFrame(frame);
