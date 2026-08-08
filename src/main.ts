import { TARGET_SUM, normalizeRect, sumTiles, tilesInRect } from './core/board';
import { Game } from './core/game';
import { coinsForScore, loadProgress, saveProgress } from './meta/progress';
import { SkillDef, buySkill, computePerks } from './meta/skills';
import { attachPointerInput, CellPoint } from './ui/input';
import { BoardRenderer, FloatingText, HintView, SelectionView } from './ui/renderer';
import { renderSkillTree } from './ui/skilltree';

/** 목표 합별 강조색 (10=초록, 13=보라, 17=청록, 20=금색) */
const TARGET_COLORS: Record<number, string> = {
  10: '#37d67a',
  13: '#b06cff',
  17: '#4dd6d2',
  20: '#ffb84d',
};

const HINT_IDLE_MS = 5_000;
const BOARD_COLS = 7;
const BOARD_ROWS = 10;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const scoreEl = $('score');
const timeEl = $('time');
const timeBarEl = $('time-bar');
const targetsEl = $('targets');
const rerollBtn = $<HTMLButtonElement>('reroll-btn');
const rerollCountEl = $('reroll-count');
const noComboEl = document.createElement('div');
noComboEl.id = 'no-combo-hint';
noComboEl.className = 'hidden';
$('board-wrap').appendChild(noComboEl);

const startOverlay = $('start-overlay');
const resultOverlay = $('result-overlay');
const skillOverlay = $('skill-overlay');
const startBtn = $<HTMLButtonElement>('start-btn');
const retryBtn = $<HTMLButtonElement>('retry-btn');
const resultScoreEl = $('result-score');
const resultCoinsEl = $('result-coins');
const resultBestEl = $('result-best');
const bestBoxStartEl = $('best-box-start');
const coinsStartEl = $('coins-start');
const skillCoinsEl = $('skill-coins');
const skillListEl = $('skill-list');

const canvas = $<HTMLCanvasElement>('board');
const renderer = new BoardRenderer(canvas, BOARD_COLS, BOARD_ROWS);

const progress = loadProgress();
let game = new Game(computePerks(progress));
let dragAnchor: CellPoint | null = null;
let selection: SelectionView | null = null;
let floats: FloatingText[] = [];
let resultShown = false;

// 힌트 스킬 상태
let idleMs = 0;
let hintRect: HintView['rect'] | null = null;
let hintDirty = true;

function markInteraction(): void {
  idleMs = 0;
}

function invalidateHint(): void {
  hintRect = null;
  hintDirty = true;
  idleMs = 0;
}

function updateSelection(current: CellPoint): void {
  if (!dragAnchor) return;
  const rect = normalizeRect(dragAnchor.c, dragAnchor.r, current.c, current.r);
  const tiles = tilesInRect(game.board, rect);
  const sum = sumTiles(game.board, tiles);
  const valid = tiles.length > 0 && game.targets.includes(sum);
  selection = { rect, sum, valid, color: TARGET_COLORS[sum] ?? TARGET_COLORS[TARGET_SUM] };
}

attachPointerInput(canvas, {
  toCell: (x, y, clamp) => renderer.cellFromPoint(x, y, clamp),
  onDragStart(cell) {
    if (game.phase !== 'playing') return;
    markInteraction();
    dragAnchor = cell;
    updateSelection(cell);
  },
  onDragMove(cell) {
    markInteraction();
    updateSelection(cell);
  },
  onDragEnd() {
    if (dragAnchor && selection && game.phase === 'playing') {
      const result = game.attemptClear(selection.rect);
      if (result.cleared) {
        const centerC = (selection.rect.c0 + selection.rect.c1) / 2;
        const centerR = (selection.rect.r0 + selection.rect.r1) / 2;
        const color = TARGET_COLORS[result.sum];
        floats.push({ col: centerC, row: centerR, ageMs: 0, text: `+${result.points}`, color });
        if (result.sum === 17) {
          floats.push({ col: centerC, row: centerR + 1, ageMs: 0, text: '+3초', color });
        }
        navigator.vibrate?.(result.extraTiles.length > 0 ? 60 : 30);
        invalidateHint();
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

function updateCoinDisplays(): void {
  const label = `🪙 ${progress.coins}`;
  coinsStartEl.textContent = label;
  skillCoinsEl.textContent = label;
}

function updateBestDisplays(): void {
  bestBoxStartEl.textContent = progress.best > 0 ? `최고 기록 ${progress.best}점` : '';
}

function updateTargetChips(): void {
  targetsEl.innerHTML = '';
  for (const t of game.targets) {
    const chip = document.createElement('span');
    chip.className = 'target-chip';
    chip.textContent = String(t);
    chip.style.setProperty('--chip-color', TARGET_COLORS[t] ?? TARGET_COLORS[TARGET_SUM]);
    targetsEl.appendChild(chip);
  }
}

function updateHud(): void {
  scoreEl.textContent = String(game.score);

  const seconds = Math.ceil(game.timeLeftMs / 1000);
  timeEl.textContent = String(seconds);
  timeBarEl.style.width = `${(game.timeLeftMs / game.durationMs) * 100}%`;
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
  const earned = coinsForScore(game.score);
  progress.coins += earned;
  const isNewBest = game.score > progress.best;
  if (isNewBest) progress.best = game.score;
  saveProgress(progress);

  resultScoreEl.textContent = String(game.score);
  resultCoinsEl.textContent = earned > 0 ? `🪙 +${earned} 코인` : '';
  resultBestEl.textContent = isNewBest ? '🎉 최고 기록 갱신!' : `최고 기록 ${progress.best}점`;
  updateCoinDisplays();
  updateBestDisplays();
  resultOverlay.classList.remove('hidden');
}

function startNewGame(): void {
  game = new Game(computePerks(progress));
  floats = [];
  dragAnchor = null;
  selection = null;
  resultShown = false;
  invalidateHint();
  startOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  skillOverlay.classList.add('hidden');
  game.start();
  updateTargetChips();
  updateHud();
}

startBtn.addEventListener('click', startNewGame);
retryBtn.addEventListener('click', startNewGame);

rerollBtn.addEventListener('click', () => {
  if (game.reroll()) {
    navigator.vibrate?.(15);
    dragAnchor = null;
    selection = null;
    invalidateHint();
    updateHud();
  }
});

// ---------- 스킬트리 오버레이 ----------

let skillReturnTo: HTMLElement = startOverlay;

function refreshSkillTree(): void {
  renderSkillTree(skillListEl, progress, onBuySkill);
  updateCoinDisplays();
}

function onBuySkill(def: SkillDef): void {
  if (buySkill(progress, def)) {
    saveProgress(progress);
    refreshSkillTree();
  }
}

function openSkillTree(returnTo: HTMLElement): void {
  skillReturnTo = returnTo;
  returnTo.classList.add('hidden');
  refreshSkillTree();
  skillOverlay.classList.remove('hidden');
}

$('skill-open-start').addEventListener('click', () => openSkillTree(startOverlay));
$('skill-open-result').addEventListener('click', () => openSkillTree(resultOverlay));
$('skill-close-btn').addEventListener('click', () => {
  skillOverlay.classList.add('hidden');
  skillReturnTo.classList.remove('hidden');
});

// ---------- 초기화 & 게임 루프 ----------

updateCoinDisplays();
updateBestDisplays();
updateTargetChips();

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

  // 힌트: 스킬 보유 + 5초간 입력 없음 + 조합 존재 시 표시
  let hint: HintView | null = null;
  if (game.perks.hint && game.phase === 'playing' && game.combosAvailable) {
    if (!dragAnchor) idleMs += dt;
    if (idleMs >= HINT_IDLE_MS) {
      if (hintDirty) {
        hintRect = game.findHintCombo();
        hintDirty = false;
      }
      if (hintRect) {
        hint = { rect: hintRect, pulse: 0.5 + 0.5 * Math.sin(ts / 250) };
      }
    }
  }

  renderer.render(game.board, selection, floats, hint);
  requestAnimationFrame(frame);
}

/** 매 프레임 전체 HUD를 갱신할 필요는 없어 시간 표시만 갱신 */
function updateHudTime(): void {
  const seconds = Math.ceil(game.timeLeftMs / 1000);
  if (timeEl.textContent !== String(seconds)) {
    timeEl.textContent = String(seconds);
    timeBarEl.classList.toggle('warning', seconds <= 10);
  }
  timeBarEl.style.width = `${(game.timeLeftMs / game.durationMs) * 100}%`;
}

requestAnimationFrame(frame);
