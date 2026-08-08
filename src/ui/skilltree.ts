import { Progress } from '../meta/progress';
import { BRANCHES, SKILLS, SkillDef, buyState, skillLevel } from '../meta/skills';

/** 스킬트리 오버레이의 목록을 현재 진행 상태로 다시 그린다 */
export function renderSkillTree(
  listEl: HTMLElement,
  progress: Progress,
  onBuy: (def: SkillDef) => void,
): void {
  listEl.innerHTML = '';

  for (const branch of BRANCHES) {
    const section = document.createElement('section');
    section.className = 'skill-branch';

    const header = document.createElement('h3');
    header.className = 'branch-name';
    header.textContent = branch.name;
    header.style.setProperty('--branch-color', branch.color);
    section.appendChild(header);

    for (const def of SKILLS.filter((s) => s.branch === branch.id)) {
      section.appendChild(renderSkillRow(def, progress, onBuy));
    }
    listEl.appendChild(section);
  }
}

function renderSkillRow(
  def: SkillDef,
  progress: Progress,
  onBuy: (def: SkillDef) => void,
): HTMLElement {
  const level = skillLevel(progress, def.id);
  const state = buyState(progress, def);

  const row = document.createElement('div');
  row.className = 'skill-row';

  const info = document.createElement('div');
  info.className = 'skill-info';

  const title = document.createElement('div');
  title.className = 'skill-name';
  title.textContent = def.name;
  if (def.maxLevel > 1) {
    const pips = document.createElement('span');
    pips.className = 'skill-pips';
    pips.textContent = '●'.repeat(level) + '○'.repeat(def.maxLevel - level);
    title.appendChild(pips);
  }
  info.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'skill-desc';
  desc.textContent = def.desc;
  info.appendChild(desc);

  if (state === 'locked' && def.requires) {
    const req = SKILLS.find((s) => s.id === def.requires!.id);
    const lockLine = document.createElement('div');
    lockLine.className = 'skill-req';
    lockLine.textContent = `🔒 ${req?.name ?? def.requires.id} Lv.${def.requires.level} 필요`;
    info.appendChild(lockLine);
  }

  row.appendChild(info);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'skill-buy-btn';
  if (state === 'maxed') {
    btn.textContent = 'MAX';
    btn.disabled = true;
    btn.classList.add('maxed');
  } else {
    btn.textContent = `🪙 ${def.costs[level]}`;
    btn.disabled = state !== 'ok';
    if (state === 'ok') btn.addEventListener('click', () => onBuy(def));
  }
  row.appendChild(btn);

  return row;
}
