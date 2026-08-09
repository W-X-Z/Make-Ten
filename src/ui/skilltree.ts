import { Progress } from '../meta/progress';
import { BRANCHES, SKILLS, SkillDef, buyState, skillLevel } from '../meta/skills';

/**
 * 노드 그래프형 스킬트리 뷰.
 * 중앙 코어에서 4계열이 사방으로 뻗는 배치, 드래그 팬 + 휠/핀치 줌,
 * 노드 탭 → 하단 상세 패널에서 구매.
 */

const UNIT = 96; // 레이아웃 단위 → px
const NODE_SIZE = 60;
const PAD = 100;
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.2;
const TAP_SLOP_PX = 8;

interface LayoutEntry {
  icon: string;
  x: number;
  y: number;
}

/** 스킬별 아이콘과 월드 좌표 (중앙 코어 기준, x→오른쪽 y→아래) */
const LAYOUT: Record<string, LayoutEntry> = {
  root: { icon: '🔟', x: 0, y: 0 },
  // 배점 — 왼쪽
  score_boost: { icon: '💰', x: -1.4, y: -0.2 },
  big_hunter: { icon: '🎣', x: -2.7, y: 0.3 },
  // 조합 — 위
  lucky_13: { icon: '🍀', x: 0.1, y: -1.4 },
  double_20: { icon: '💎', x: -0.6, y: -2.5 },
  // 시간 — 오른쪽
  time_extend: { icon: '⏳', x: 1.4, y: 0.2 },
  hourglass: { icon: '⌛', x: 2.7, y: -0.5 },
  last_spurt: { icon: '🔥', x: 2.7, y: 0.9 },
  // 유틸 — 아래
  reroll_charge: { icon: '🔄', x: -0.7, y: 1.4 },
  reroll_rush: { icon: '🚀', x: -1.7, y: 2.3 },
  hint: { icon: '💡', x: 0.9, y: 1.3 },
};

const BRANCH_COLORS: Record<string, string> = Object.fromEntries(
  BRANCHES.map((b) => [b.id, b.color]),
);

export class SkillTreeView {
  private viewport: HTMLElement;
  private world: HTMLElement;
  private detail: HTMLElement;
  private detailName: HTMLElement;
  private detailDesc: HTMLElement;
  private detailReq: HTMLElement;
  private detailBuy: HTMLButtonElement;

  private nodeEls = new Map<string, HTMLElement>();
  private edgeEls = new Map<string, SVGLineElement>();
  private selectedId: string | null = null;

  private tx = 0;
  private ty = 0;
  private scale = 1;
  private minX = 0;
  private minY = 0;
  private worldW = 0;
  private worldH = 0;

  constructor(
    private getProgress: () => Progress,
    private onBuy: (def: SkillDef) => void,
  ) {
    this.viewport = document.getElementById('skill-viewport')!;
    this.world = document.getElementById('skill-world')!;
    this.detail = document.getElementById('skill-detail')!;
    this.detailName = document.getElementById('detail-name')!;
    this.detailDesc = document.getElementById('detail-desc')!;
    this.detailReq = document.getElementById('detail-req')!;
    this.detailBuy = document.getElementById('detail-buy') as HTMLButtonElement;

    this.build();
    this.attachPanZoom();
    this.detailBuy.addEventListener('click', () => {
      const def = SKILLS.find((s) => s.id === this.selectedId);
      if (def) this.onBuy(def);
    });
  }

  // ---------- 월드 구성 ----------

  private centerPx(id: string): { x: number; y: number } {
    const l = LAYOUT[id];
    return { x: (l.x - this.minX) * UNIT + PAD, y: (l.y - this.minY) * UNIT + PAD };
  }

  private build(): void {
    const xs = Object.values(LAYOUT).map((l) => l.x);
    const ys = Object.values(LAYOUT).map((l) => l.y);
    this.minX = Math.min(...xs);
    this.minY = Math.min(...ys);
    this.worldW = (Math.max(...xs) - this.minX) * UNIT + PAD * 2;
    this.worldH = (Math.max(...ys) - this.minY) * UNIT + PAD * 2;
    this.world.style.width = `${this.worldW}px`;
    this.world.style.height = `${this.worldH}px`;

    // 간선 (SVG): 선행 스킬 → 노드, 선행이 없으면 코어 → 노드
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'skill-edges';
    svg.setAttribute('width', String(this.worldW));
    svg.setAttribute('height', String(this.worldH));
    for (const def of SKILLS) {
      const from = this.centerPx(def.requires?.id ?? 'root');
      const to = this.centerPx(def.id);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      svg.appendChild(line);
      this.edgeEls.set(def.id, line);
    }
    this.world.appendChild(svg);

    // 노드
    this.world.appendChild(this.buildNode('root', LAYOUT.root.icon, null));
    for (const def of SKILLS) {
      this.world.appendChild(this.buildNode(def.id, LAYOUT[def.id].icon, def));
    }
  }

  private buildNode(id: string, icon: string, def: SkillDef | null): HTMLElement {
    const el = document.createElement('div');
    el.className = 'skill-node' + (def ? '' : ' root');
    el.dataset.id = id;
    if (def) el.style.setProperty('--node-color', BRANCH_COLORS[def.branch]);
    const { x, y } = this.centerPx(id);
    el.style.left = `${x - NODE_SIZE / 2}px`;
    el.style.top = `${y - NODE_SIZE / 2}px`;

    const iconEl = document.createElement('span');
    iconEl.className = 'node-icon';
    iconEl.textContent = icon;
    el.appendChild(iconEl);

    if (def) {
      const badge = document.createElement('span');
      badge.className = 'node-badge';
      el.appendChild(badge);
    }
    this.nodeEls.set(id, el);
    return el;
  }

  // ---------- 팬 / 줌 ----------

  private applyTransform(): void {
    this.world.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
  }

  /** 뷰포트 좌표 (cx, cy)를 고정점으로 배율 변경 */
  private zoomAt(cx: number, cy: number, factor: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const applied = next / this.scale;
    this.tx = cx - (cx - this.tx) * applied;
    this.ty = cy - (cy - this.ty) * applied;
    this.scale = next;
    this.applyTransform();
  }

  private attachPanZoom(): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let panning = false;
    let pinchDist = 0;

    const local = (e: PointerEvent) => {
      const r = this.viewport.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.viewport.addEventListener('pointerdown', (e) => {
      // 상세 패널 내부 조작(구매 버튼)은 팬/탭 처리에서 제외
      if ((e.target as HTMLElement).closest('#skill-detail')) return;
      this.viewport.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) panning = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    this.viewport.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId)!;
      const now = local(e);
      pointers.set(e.pointerId, now);

      if (pointers.size === 1) {
        const dx = now.x - prev.x;
        const dy = now.y - prev.y;
        if (panning || Math.hypot(dx, dy) > TAP_SLOP_PX / 2) {
          panning = true;
          this.tx += dx;
          this.ty += dy;
          this.applyTransform();
        }
      } else if (pointers.size === 2) {
        panning = true;
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinchDist);
        }
        pinchDist = dist;
      }
    });

    const end = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (pointers.size === 0 && !panning) this.handleTap(e);
    };
    this.viewport.addEventListener('pointerup', end);
    this.viewport.addEventListener('pointercancel', end);

    this.viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.viewport.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
  }

  private handleTap(e: PointerEvent): void {
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (target?.closest('#skill-detail')) return;
    const nodeEl = target?.closest('.skill-node') as HTMLElement | undefined;
    const id = nodeEl?.dataset.id;
    this.select(id && id !== 'root' ? id : null);
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.refresh();
  }

  /** 열 때 호출: 코어가 화면 중앙에 오도록 배율/위치 리셋 */
  resetView(): void {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    this.scale = Math.min(1, Math.max(MIN_SCALE, Math.min(vw / this.worldW, vh / this.worldH) * 1.15));
    const root = this.centerPx('root');
    this.tx = vw / 2 - root.x * this.scale;
    this.ty = vh / 2 - root.y * this.scale;
    this.applyTransform();
    this.select(null);
  }

  // ---------- 상태 반영 ----------

  refresh(): void {
    const progress = this.getProgress();

    for (const def of SKILLS) {
      const el = this.nodeEls.get(def.id)!;
      const level = skillLevel(progress, def.id);
      const state = buyState(progress, def);
      el.classList.toggle('owned', level > 0);
      el.classList.toggle('maxed', state === 'maxed');
      el.classList.toggle('locked', state === 'locked');
      el.classList.toggle('buyable', state === 'ok');
      el.classList.toggle('selected', def.id === this.selectedId);

      const badge = el.querySelector('.node-badge')!;
      badge.textContent =
        def.maxLevel > 1 ? `${level}/${def.maxLevel}` : state === 'maxed' ? '✓' : '';
      badge.classList.toggle('hidden', badge.textContent === '');

      this.edgeEls.get(def.id)!.classList.toggle('lit', level > 0);
    }

    this.refreshDetail(progress);
  }

  private refreshDetail(progress: Progress): void {
    const def = SKILLS.find((s) => s.id === this.selectedId);
    if (!def) {
      this.detail.classList.add('hidden');
      return;
    }
    const level = skillLevel(progress, def.id);
    const state = buyState(progress, def);

    const levelText = def.maxLevel > 1 ? ` Lv.${level}/${def.maxLevel}` : '';
    this.detailName.textContent = `${LAYOUT[def.id].icon} ${def.name}${levelText}`;
    this.detailDesc.textContent = def.desc;

    if (state === 'locked' && def.requires) {
      const req = SKILLS.find((s) => s.id === def.requires!.id);
      this.detailReq.textContent = `🔒 ${req?.name ?? def.requires.id} Lv.${def.requires.level} 필요`;
      this.detailReq.classList.remove('hidden');
    } else {
      this.detailReq.classList.add('hidden');
    }

    if (state === 'maxed') {
      this.detailBuy.textContent = 'MAX';
      this.detailBuy.disabled = true;
      this.detailBuy.classList.add('maxed');
    } else {
      this.detailBuy.textContent = `🪙 ${def.costs[level]}`;
      this.detailBuy.disabled = state !== 'ok';
      this.detailBuy.classList.remove('maxed');
    }
    this.detail.classList.remove('hidden');
  }
}
