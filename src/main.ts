import { TARGET_SUM, normalizeRect, sumTiles, tilesInRect } from './core/board';
import { Game } from './core/game';
import { coinsForScore, loadProgress, saveProgress } from './meta/progress';
import { SkillDef, buySkill, computePerks, skillLevel, unlockedTargets } from './meta/skills';
import { AudioEngine } from './ui/audio';
import { attachPointerInput, CellPoint } from './ui/input';
import { BoardRenderer, FloatingText, HintView, SelectionView } from './ui/renderer';
import { SkillTreeView } from './ui/skilltree';

/** 목표 합별 강조색 (10=초록, 13=보라, 15=분홍, 17=청록, 20=금색) */
const TARGET_COLORS: Record<number, string> = {
  10: '#37d67a',
  13: '#b06cff',
  15: '#ff7eb6',
  17: '#4dd6d2',
  20: '#ffb84d',
};

/** 목표 선택 화면에 노출되는 특수 숫자 정의 */
const TARGET_OPTIONS: { sum: number; desc: string; skill: string | null }[] = [
  { sum: 13, desc: '십자 폭발! 인접 타일 제거', skill: 'lucky_13' },
  { sum: 15, desc: '랜덤 보상! 3배/시간/폭발', skill: 'mystery_15' },
  { sum: 17, desc: '보드의 7이 모두 1로!', skill: null },
  { sum: 20, desc: '해당 조합 점수 3배!', skill: 'double_20' },
];

const MAX_SPECIAL_TARGETS = 3;
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
const resetBtn = $<HTMLButtonElement>('reset-btn');
const resetCountEl = $('reset-count');
const boardFlashEl = document.createElement('div');
boardFlashEl.id = 'board-flash';
boardFlashEl.className = 'hidden';
$('board-wrap').appendChild(boardFlashEl);

const homeScreen = $('home-screen');
const selectScreen = $('select-screen');
const resultOverlay = $('result-overlay');
const skillOverlay = $('skill-overlay');
const targetOptionsEl = $('target-options');
const resultScoreEl = $('result-score');
const resultCoinsEl = $('result-coins');
const resultBestEl = $('result-best');
const bestBoxStartEl = $('best-box-start');
const coinsStartEl = $('coins-start');
const skillCoinsEl = $('skill-coins');

const canvas = $<HTMLCanvasElement>('board');
const renderer = new BoardRenderer(canvas, BOARD_COLS, BOARD_ROWS);
const audio = new AudioEngine();

// 테스트용 URL 파라미터: ?reset=1 진행 초기화, ?coins=1000 코인 설정
const testParams = new URLSearchParams(location.search);
if (testParams.has('reset')) {
  localStorage.clear();
  location.replace(location.pathname);
}

const progress = loadProgress();
const coinsOverride = Number(testParams.get('coins'));
if (coinsOverride > 0) {
  progress.coins = coinsOverride;
  saveProgress(progress);
}

let game = new Game(computePerks(progress));
let dragAnchor: CellPoint | null = null;
let selection: SelectionView | null = null;
let floats: FloatingText[] = [];
let resultShown = false;
let flashTimer = 0;

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

function flashBoard(text: string): void {
  boardFlashEl.textContent = text;
  boardFlashEl.classList.remove('hidden');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => boardFlashEl.classList.add('hidden'), 1300);
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
        if (result.timeBonusMs > 0) {
          floats.push({
            col: centerC,
            row: centerR + 1,
            ageMs: 0,
            text: `+${(result.timeBonusMs / 1000).toFixed(result.timeBonusMs % 1000 ? 1 : 0)}초`,
            color: '#eef1f8',
          });
        }
        if (result.convertedSevens > 0) {
          flashBoard(`7 → 1 변환 ×${result.convertedSevens}`);
        }
        if (result.mystery === 'triple') flashBoard('🎁 점수 3배!');
        if (result.mystery === 'time') flashBoard('🎁 +5초!');
        if (result.mystery === 'boom') flashBoard('🎁 폭발!');
        if (result.boardReset) {
          flashBoard('조합 소진 — 보드 초기화!');
        }
        audio.sfxClear(result.sum);
        navigator.vibrate?.(result.extraTiles.length > 0 || result.convertedSevens > 0 ? 60 : 30);
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
  timeBarEl.style.width = `${Math.min(100, (game.timeLeftMs / game.durationMs) * 100)}%`;
  timeBarEl.classList.toggle('warning', game.phase === 'playing' && seconds <= 10);

  resetCountEl.textContent = `×${game.resetsLeft}`;
  resetBtn.disabled = !game.canReset();
}

function showResult(): void {
  resultShown = true;
  audio.sfxEnd();
  const earned = Math.floor(coinsForScore(game.score) * game.perks.coinBonus);
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

// ---------- 목표 선택 화면 ----------

function renderTargetOptions(): void {
  targetOptionsEl.innerHTML = '';

  // 10은 항상 포함 (고정 표시)
  const fixed = document.createElement('div');
  fixed.className = 'target-option fixed selected';
  fixed.style.setProperty('--chip-color', TARGET_COLORS[TARGET_SUM]);
  fixed.innerHTML = `<span class="opt-num">10</span><span class="opt-desc">기본 목표 · 제거 시 +1초</span>`;
  targetOptionsEl.appendChild(fixed);

  const pool = unlockedTargets(progress);
  for (const opt of TARGET_OPTIONS) {
    const unlocked = pool.includes(opt.sum);
    const selected = unlocked && progress.targets.includes(opt.sum);

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'target-option';
    el.dataset.sum = String(opt.sum);
    el.style.setProperty('--chip-color', TARGET_COLORS[opt.sum]);
    el.classList.toggle('selected', selected);
    el.classList.toggle('locked', !unlocked);

    const desc = unlocked ? opt.desc : '스킬트리에서 해금';
    el.innerHTML = `<span class="opt-num">${unlocked ? opt.sum : '🔒'}</span><span class="opt-desc">${desc}</span>`;

    if (unlocked) {
      el.addEventListener('click', () => {
        const idx = progress.targets.indexOf(opt.sum);
        if (idx >= 0) {
          progress.targets.splice(idx, 1);
        } else if (progress.targets.length < MAX_SPECIAL_TARGETS) {
          progress.targets.push(opt.sum);
        }
        saveProgress(progress);
        renderTargetOptions();
      });
    }
    targetOptionsEl.appendChild(el);
  }
}

function openSelectScreen(): void {
  renderTargetOptions();
  homeScreen.classList.add('hidden');
  selectScreen.classList.remove('hidden');
}

function startNewGame(): void {
  const perks = computePerks(progress);
  const chosen = progress.targets
    .filter((t) => perks.specialTargets.includes(t))
    .slice(0, MAX_SPECIAL_TARGETS);
  game = new Game({ ...perks, specialTargets: chosen });

  floats = [];
  dragAnchor = null;
  selection = null;
  resultShown = false;
  invalidateHint();
  homeScreen.classList.add('hidden');
  selectScreen.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  skillOverlay.classList.add('hidden');
  game.start();
  updateTargetChips();
  updateHud();
}

$('start-btn').addEventListener('click', () => {
  audio.startMusic(); // 사용자 제스처 안에서 BGM 시작 (autoplay 정책)
  openSelectScreen();
});
$('play-btn').addEventListener('click', startNewGame);
$('back-btn').addEventListener('click', () => {
  selectScreen.classList.add('hidden');
  homeScreen.classList.remove('hidden');
});
$('retry-btn').addEventListener('click', startNewGame);

$('quit-btn').addEventListener('click', () => game.end());

$('home-btn').addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  homeScreen.classList.remove('hidden');
  updateCoinDisplays();
  updateBestDisplays();
});

resetBtn.addEventListener('click', () => {
  if (game.reset()) {
    audio.sfxReset();
    navigator.vibrate?.(15);
    dragAnchor = null;
    selection = null;
    invalidateHint();
    flashBoard('보드 초기화!');
    updateHud();
  }
});

// ---------- 사운드 토글 ----------

const soundBtns = [$('sound-btn'), $('sound-btn-home')];

function updateSoundButtons(): void {
  for (const btn of soundBtns) btn.textContent = audio.muted ? '🔇' : '🔊';
}

for (const btn of soundBtns) {
  btn.addEventListener('click', () => {
    audio.toggleMute();
    updateSoundButtons();
  });
}
updateSoundButtons();

// ---------- 스킬트리 오버레이 ----------

let skillReturnTo: HTMLElement = homeScreen;

function onBuySkill(def: SkillDef): void {
  if (buySkill(progress, def)) {
    // 새로 해금한 목표는 바로 선택에 추가 (최대치 내에서)
    if (def.id === 'lucky_13' && skillLevel(progress, 'lucky_13') === 1) autoSelect(13);
    if (def.id === 'mystery_15' && skillLevel(progress, 'mystery_15') === 1) autoSelect(15);
    if (def.id === 'double_20' && skillLevel(progress, 'double_20') === 1) autoSelect(20);
    saveProgress(progress);
    skillTree.refresh();
    updateCoinDisplays();
  }
}

function autoSelect(sum: number): void {
  if (!progress.targets.includes(sum) && progress.targets.length < MAX_SPECIAL_TARGETS) {
    progress.targets.push(sum);
  }
}

const skillTree = new SkillTreeView(() => progress, onBuySkill);

function openSkillTree(returnTo: HTMLElement): void {
  skillReturnTo = returnTo;
  returnTo.classList.add('hidden');
  skillOverlay.classList.remove('hidden');
  // 뷰포트가 표시된 뒤에야 크기를 알 수 있으므로 여기서 리셋
  skillTree.resetView();
  skillTree.refresh();
  updateCoinDisplays();
}

$('skill-open-start').addEventListener('click', () => openSkillTree(homeScreen));
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

  // 힌트: 스킬 보유 + 일정 시간 입력 없음 시 표시 (대기 시간은 스킬 레벨에 따라)
  let hint: HintView | null = null;
  if (game.perks.hint && game.phase === 'playing') {
    if (!dragAnchor) idleMs += dt;
    if (idleMs >= game.perks.hintDelayMs) {
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
  timeBarEl.style.width = `${Math.min(100, (game.timeLeftMs / game.durationMs) * 100)}%`;
}

requestAnimationFrame(frame);
