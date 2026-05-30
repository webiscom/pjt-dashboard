'use client';

import { useEffect, useRef } from 'react';
import './dashboard.css';
import { DS_DATA } from './dsData';

interface RawTask {
  ID: string;
  TEXT: string;
  START_DATE: string;
  END_DATE: string;
  DURATION: string;
  PROGRESS: string;
  PARENT: string;
  USER: string;
  ACTL_BGNG_YMD: string | null;
  ACTL_CMPTN_YMD: string | null;
  PRFMNC: string;
  _depth?: number;
  children?: RawTask[];
}

interface Task {
  id: string;
  depth: number;
  feature: string;
  owner: string;
  ownerAv: string;
  unit: number;
  md: number;
  prfmnc: number;
  ps: Date | null;
  pe: Date | null;
  as: Date | null;
  ae: Date | null;
  delay: number;
}

// ── Date helpers ──────────────────────────────────────────────
function parseYYYYMMDD(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : null;
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function fmt(d: Date | null): string {
  if (!d) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const AV_POOL = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6'];
function nameToAv(name: string): string {
  const h = (name || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
  return AV_POOL[h % AV_POOL.length];
}

// ── Tree builder ──────────────────────────────────────────────
function buildTree(items: RawTask[]): RawTask[] {
  const map: Record<string, RawTask & { children: RawTask[] }> = {};
  items.forEach(it => { map[it.ID] = { ...it, children: [] }; });
  const roots: (RawTask & { children: RawTask[] })[] = [];
  items.forEach(it => {
    if (!it.PARENT || !map[it.PARENT]) roots.push(map[it.ID]);
    else map[it.PARENT].children.push(map[it.ID]);
  });
  const flat: RawTask[] = [];
  function walk(node: RawTask & { children: RawTask[] }, depth: number) {
    flat.push({ ...node, _depth: depth });
    node.children.forEach(c => walk(c as RawTask & { children: RawTask[] }, depth + 1));
  }
  roots.forEach(r => walk(r, 0));
  return flat;
}

function mapTask(raw: RawTask, today: Date): Task {
  const ps = parseYYYYMMDD(raw.START_DATE);
  const dur = Math.max(1, parseInt(raw.DURATION) || 1);
  const pe = parseYYYYMMDD(raw.END_DATE) || (ps ? new Date(ps.getTime() + (dur - 1) * 86400000) : null);
  const as = parseYYYYMMDD(raw.ACTL_BGNG_YMD);
  const ae = parseYYYYMMDD(raw.ACTL_CMPTN_YMD);
  const progress = parseFloat(raw.PROGRESS || '0');
  const unit = Math.min(100, Math.round(progress <= 1 ? progress * 100 : progress));
  let delay = 0;
  if (pe) {
    if (ae && ae > pe) delay = dayDiff(pe, ae);
    else if (!ae && as && today > pe) delay = dayDiff(pe, today);
  }
  return {
    id: raw.ID,
    depth: raw._depth || 0,
    feature: raw.TEXT || '(미입력)',
    owner: raw.USER || '—',
    ownerAv: raw.USER ? nameToAv(raw.USER) : 'av-1',
    unit,
    md: dur,
    prfmnc: Math.min(100, Math.round(parseFloat(raw.PRFMNC || '0') * (parseFloat(raw.PRFMNC || '0') <= 1 ? 100 : 1))),
    ps, pe, as, ae, delay,
  };
}

function statusClass(t: Task): string {
  if (t.unit >= 100) return 'done';
  if (t.delay >= 3) return 'danger';
  if (t.delay > 0) return 'warn';
  return '';
}

function buildBars(t: Task, PROJECT_START: Date, TODAY: Date, TOTAL_DAYS: number, DAY_W: number): string {
  let html = '';
  if (t.ps && t.pe) {
    const si = Math.max(0, dayDiff(PROJECT_START, t.ps));
    const ei = Math.min(TOTAL_DAYS - 1, dayDiff(PROJECT_START, t.pe));
    const left = si * DAY_W + 2;
    const width = Math.max(DAY_W - 4, (ei - si + 1) * DAY_W - 4);
    html += `<div class="bar planned" style="left:${left}px;width:${width}px" title="예정 ${fmt(t.ps)} ~ ${fmt(t.pe)}"></div>`;
  }
  if (t.as) {
    const si = Math.max(0, dayDiff(PROJECT_START, t.as));
    const endDate = t.ae || TODAY;
    const ei = Math.min(TOTAL_DAYS - 1, dayDiff(PROJECT_START, endDate));
    const left = si * DAY_W + 2;
    const width = Math.max(DAY_W - 4, (ei - si + 1) * DAY_W - 4);
    const days = ei - si + 1;
    const sc = statusClass(t);
    html += `<div class="bar actual ${sc}" style="left:${left}px;width:${width}px;--p:${t.unit}" title="실적 ${fmt(t.as)} ~ ${fmt(t.ae || TODAY)} · ${t.unit}%"><span class="label">${days}일 · ${t.unit}%</span></div>`;
    if (t.delay > 0 && t.pe) {
      const peI = Math.min(TOTAL_DAYS - 1, dayDiff(PROJECT_START, t.pe));
      const tailLeft = (peI + 1) * DAY_W + 2;
      const tailW = t.delay * DAY_W - 4;
      if (tailW > 0) html += `<div class="bar delay-tail" style="left:${tailLeft}px;width:${tailW}px" title="지연 ${t.delay}일"></div>`;
    }
  }
  return html;
}

export default function WBSDashboard() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);

    const raw = [...DS_DATA.data_pj].sort((a, b) => parseInt(a.ID) - parseInt(b.ID)) as RawTask[];
    const flat = buildTree(raw);
    const TASKS = flat.map(it => mapTask(it, TODAY));

    const allDates = TASKS.flatMap(t => [t.ps, t.pe, t.as, t.ae].filter(Boolean)) as Date[];
    if (!allDates.length) return;

    let minTs = Math.min(...allDates.map(d => d.getTime()));
    let maxTs = Math.max(...allDates.map(d => d.getTime()));
    if (TODAY.getTime() < minTs) minTs = TODAY.getTime();
    if (TODAY.getTime() > maxTs) maxTs = TODAY.getTime();

    const PROJECT_START = new Date(minTs - 3 * 86400000);
    const PROJECT_END = new Date(maxTs + 7 * 86400000);
    const DAY_W = 28;

    const DAYS: Date[] = [];
    const d = new Date(PROJECT_START);
    while (d <= PROJECT_END) { DAYS.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const TOTAL_DAYS = DAYS.length;

    const MONTHS: { key: string; year: number; month: number; span: number }[] = [];
    let cur: { key: string; year: number; month: number; span: number } | null = null;
    DAYS.forEach(day => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      if (!cur || cur.key !== key) {
        cur = { key, year: day.getFullYear(), month: day.getMonth() + 1, span: 0 };
        MONTHS.push(cur);
      }
      cur.span++;
    });

    // Build colgroup
    const wbsCols = root.querySelector<HTMLElement>('#wbsCols');
    const wbsHead = root.querySelector<HTMLElement>('#wbsHead');
    const wbsBody = root.querySelector<HTMLElement>('#wbsBody');
    if (!wbsCols || !wbsHead || !wbsBody) return;

    [['c-feature'], ['c-owner'], ['c-unit'], ['c-md'], ['c-date'], ['c-date'], ['c-date'], ['c-date'], ['c-delay']].forEach(([cls]) => {
      const c = document.createElement('col'); c.className = cls; wbsCols.appendChild(c);
    });
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const c = document.createElement('col'); c.className = 'c-day'; wbsCols.appendChild(c);
    }

    // Build thead
    const tr1 = document.createElement('tr');
    tr1.innerHTML = `
      <th rowspan="3" class="sticky-l" data-col="0">업무명</th>
      <th rowspan="3" class="sticky-l" data-col="1">담당자</th>
      <th rowspan="3" class="sticky-l" data-col="2">진행률</th>
      <th rowspan="3" class="sticky-l" data-col="3">M/D</th>
      <th colspan="2" class="sticky-l" data-col="4">작업 예정일</th>
      <th colspan="2" class="sticky-l" data-col="6">작업 실적일</th>
      <th rowspan="3" class="sticky-l sticky-shadow" data-col="8">지연</th>
      <th colspan="${TOTAL_DAYS}">전체 공정일</th>
    `;
    wbsHead.appendChild(tr1);

    const tr2 = document.createElement('tr');
    let r2 = `<th rowspan="2" class="sticky-l" data-col="4">시작일</th><th rowspan="2" class="sticky-l" data-col="5">종료일</th><th rowspan="2" class="sticky-l" data-col="6">시작일</th><th rowspan="2" class="sticky-l" data-col="7">종료일</th>`;
    MONTHS.forEach(m => {
      r2 += `<th class="month" colspan="${m.span}"><span class="y">${m.year}</span>${String(m.month).padStart(2, '0')}월</th>`;
    });
    tr2.innerHTML = r2;
    wbsHead.appendChild(tr2);

    const tr3 = document.createElement('tr');
    let r3 = '';
    DAYS.forEach((day, i) => {
      const dow = day.getDay();
      const cls = ['day'];
      if (dow === 0 || dow === 6) cls.push('weekend');
      if (i === TOTAL_DAYS - 1 || (DAYS[i + 1] && DAYS[i + 1].getDate() === 1)) cls.push('month-end');
      r3 += `<th class="${cls.join(' ')}">${day.getDate()}</th>`;
    });
    tr3.innerHTML = r3;
    wbsHead.appendChild(tr3);

    // Build tbody
    TASKS.forEach((t, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.idx = String(idx);
      const sc = statusClass(t);
      let delayHtml: string;
      if (!t.as) delayHtml = `<span class="delay-tag zero">—</span>`;
      else if (t.delay > 0) delayHtml = `<span class="delay-tag bad">+${t.delay}일</span>`;
      else delayHtml = `<span class="delay-tag ok">정상</span>`;
      const padL = 8 + t.depth * 16;
      const depthMark = t.depth > 0 ? `<span class="depth-ind">└</span>` : '';
      tr.innerHTML = `
        <td class="sticky-l feature-cell" data-col="0" style="padding-left:${padL}px">${depthMark}${t.feature}</td>
        <td class="sticky-l" data-col="1">${t.owner !== '—' ? `<span class="owner"><span class="av ${t.ownerAv}">${t.owner.slice(-2)}</span>${t.owner}</span>` : `<span class="owner">—</span>`}</td>
        <td class="sticky-l" data-col="2"><div class="progress-wrap"><div class="progress ${sc}" style="--p:${t.unit}"></div><span>${t.unit}%</span></div></td>
        <td class="sticky-l num" data-col="3">${t.md}</td>
        <td class="sticky-l date" data-col="4">${fmt(t.ps)}</td>
        <td class="sticky-l date" data-col="5">${fmt(t.pe)}</td>
        <td class="sticky-l date" data-col="6">${fmt(t.as)}</td>
        <td class="sticky-l date" data-col="7">${fmt(t.ae)}</td>
        <td class="sticky-l sticky-shadow delay" data-col="8">${delayHtml}</td>
        <td class="timeline" colspan="${TOTAL_DAYS}"><div class="bars">${buildBars(t, PROJECT_START, TODAY, TOTAL_DAYS, DAY_W)}</div></td>
      `;
      wbsBody.appendChild(tr);
    });

    // Today line
    const todayIdx = dayDiff(PROJECT_START, TODAY);
    if (todayIdx >= 0 && todayIdx < TOTAL_DAYS) {
      root.querySelectorAll('.timeline .bars').forEach(b => {
        const l = document.createElement('div');
        l.className = 'today-line';
        (l as HTMLElement).style.left = (todayIdx * DAY_W + DAY_W / 2) + 'px';
        b.appendChild(l);
      });
    }

    // KPI update
    const total = TASKS.length;
    const done = TASKS.filter(t => t.unit >= 100).length;
    const active = TASKS.filter(t => t.unit > 0 && t.unit < 100).length;
    const waiting = TASKS.filter(t => t.unit === 0).length;
    const delayed = TASKS.filter(t => t.delay > 0).length;
    const avgDelay = delayed ? Math.round(TASKS.filter(t => t.delay > 0).reduce((s, t) => s + t.delay, 0) / delayed * 10) / 10 : 0;
    const avgProgress = total ? Math.round(TASKS.reduce((s, t) => s + t.unit, 0) / total) : 0;

    const ringEl = root.querySelector<HTMLElement>('.ring');
    if (ringEl) {
      ringEl.style.setProperty('--p', String(avgProgress));
      const span = ringEl.querySelector('span');
      if (span) span.textContent = `${avgProgress}%`;
    }
    const kpis = root.querySelectorAll('.kpi');
    if (kpis[0]) {
      const v = kpis[0].querySelector('.kpi-value');
      if (v) v.innerHTML = `${avgProgress}<span class="sub">%</span>`;
    }
    if (kpis[1]) {
      const v = kpis[1].querySelector('.kpi-value');
      const delta = kpis[1].querySelector('.kpi-delta');
      if (v) v.innerHTML = `${done}<span class="sub"> / ${total}</span>`;
      if (delta) delta.textContent = `진행 중 ${active} · 대기 ${waiting}`;
    }
    if (kpis[3]) {
      const v = kpis[3].querySelector('.kpi-value');
      const delta = kpis[3].querySelector('.kpi-delta');
      if (v) v.innerHTML = `${delayed}<span class="sub" style="color: var(--text-2);"> 건</span>`;
      if (delta && delayed > 0) delta.innerHTML = `<span class="down">평균 +${avgDelay} 일</span> &nbsp;즉시 대응 필요`;
    }

    // Project period
    const periodEl = root.querySelector<HTMLElement>('#projPeriod');
    if (periodEl) {
      const s = new Date(minTs), e = new Date(maxTs);
      periodEl.textContent = `${s.getFullYear()}.${String(s.getMonth() + 1).padStart(2, '0')}.${String(s.getDate()).padStart(2, '0')} ~ ${e.getFullYear()}.${String(e.getMonth() + 1).padStart(2, '0')}.${String(e.getDate()).padStart(2, '0')}`;
    }
    const countEl = root.querySelector<HTMLElement>('#projTaskCount');
    if (countEl) countEl.textContent = `업무 ${TASKS.length}건`;

    // Sticky offsets
    function applyStickyOffsets() {
      if (!wbsBody || !wbsHead) return;
      const firstRow = wbsBody.querySelector('tr');
      if (!firstRow) return;
      const offsets: Record<string, number> = {};
      let left = 0;
      firstRow.querySelectorAll<HTMLElement>('td.sticky-l').forEach(td => {
        offsets[td.dataset.col!] = left;
        left += td.getBoundingClientRect().width;
      });
      wbsBody.querySelectorAll('tr').forEach(tr => {
        tr.querySelectorAll<HTMLElement>('td.sticky-l').forEach(td => {
          if (offsets[td.dataset.col!] !== undefined) td.style.left = offsets[td.dataset.col!] + 'px';
        });
      });
      wbsHead.querySelectorAll<HTMLElement>('th.sticky-l').forEach(th => {
        if (offsets[th.dataset.col!] !== undefined) th.style.left = offsets[th.dataset.col!] + 'px';
      });
    }

    requestAnimationFrame(() => {
      applyStickyOffsets();
      const idx = dayDiff(PROJECT_START, TODAY);
      const scroll = root!.querySelector<HTMLElement>('#wbsScroll');
      if (idx > 5 && scroll) {
        const stickyWidth = [...(wbsBody!.querySelector('tr')?.querySelectorAll('td.sticky-l') || [])]
          .reduce((s, td) => s + td.getBoundingClientRect().width, 0);
        scroll.scrollLeft = Math.max(0, idx * DAY_W - scroll.clientWidth / 2 + stickyWidth / 2);
      }
    });
    window.addEventListener('resize', applyStickyOffsets);

    // Filters
    let currentFilter = 'all';
    let currentQuery = '';
    function matchesFilter(t: Task) {
      switch (currentFilter) {
        case 'active': return t.unit > 0 && t.unit < 100;
        case 'delay': return t.delay > 0;
        case 'done': return t.unit >= 100;
        default: return true;
      }
    }
    function applyFilters() {
      if (!wbsBody) return;
      wbsBody.querySelectorAll<HTMLElement>('tr').forEach(tr => {
        const t = TASKS[+tr.dataset.idx!];
        if (!t) return;
        tr.style.display = (matchesFilter(t) && (!currentQuery || t.feature.toLowerCase().includes(currentQuery) || t.owner.toLowerCase().includes(currentQuery))) ? '' : 'none';
      });
    }
    root.querySelectorAll('.seg [data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.seg [data-filter]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('on'); btn.setAttribute('aria-selected', 'true');
        currentFilter = (btn as HTMLElement).dataset.filter!;
        applyFilters();
      });
    });
    const searchInput = root.querySelector<HTMLInputElement>('.search');
    if (searchInput) {
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { currentQuery = searchInput.value.trim().toLowerCase(); applyFilters(); }
      });
      searchInput.addEventListener('search', () => {
        if (!searchInput.value) { currentQuery = ''; applyFilters(); }
      });
    }

    // Theme toggle
    const themeBtn = root.querySelector<HTMLButtonElement>('#themeToggle');
    const iconMoon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    const iconSun = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
    function applyTheme(mode: string) {
      if (root) root.dataset.theme = mode;
      if (themeBtn) {
        themeBtn.innerHTML = mode === 'dark' ? iconMoon : iconSun;
        themeBtn.setAttribute('aria-label', mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
      }
    }
    const savedTheme = localStorage.getItem('atlas_theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme(savedTheme);
    const handleTheme = () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('atlas_theme', next);
    };
    themeBtn?.addEventListener('click', handleTheme);

    // Mobile menu
    const menuBtn = root.querySelector<HTMLButtonElement>('#menuBtn');
    const sheetBack = root.querySelector<HTMLElement>('#sheetBack');
    const sheetClose = root.querySelector<HTMLButtonElement>('#sheetClose');
    const openMenu = () => { root.classList.add('menu-open'); menuBtn?.setAttribute('aria-expanded', 'true'); };
    const closeMenu = () => { root.classList.remove('menu-open'); menuBtn?.setAttribute('aria-expanded', 'false'); };
    menuBtn?.addEventListener('click', openMenu);
    sheetClose?.addEventListener('click', closeMenu);
    sheetBack?.addEventListener('click', closeMenu);

    // Modal
    const modal = root.querySelector<HTMLElement>('#modalBack');
    const form = root.querySelector<HTMLFormElement>('#applyForm');
    const openModal = () => { modal?.classList.add('open'); modal?.setAttribute('aria-hidden', 'false'); setTimeout(() => form?.querySelector<HTMLInputElement>('input')?.focus(), 100); };
    const closeModal = () => { modal?.classList.remove('open'); modal?.setAttribute('aria-hidden', 'true'); };
    root.querySelector('#applyBtnMobile')?.addEventListener('click', openModal);
    root.querySelector('#reportBtn')?.addEventListener('click', openModal);
    root.querySelector('#modalCancel')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    const handleKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeModal(); closeMenu(); } };
    document.addEventListener('keydown', handleKeydown);

    form?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = fd.get('name') || '';
      const email = fd.get('email') || '';
      const role = fd.get('role') || '';
      const message = fd.get('message') || '';
      const subject = encodeURIComponent(`[ECS WBS] 프로젝트 참여 신청 - ${name}`);
      const body = encodeURIComponent(`안녕하세요, ECS WBS 프로젝트 참여를 신청합니다.\n\n■ 이름: ${name}\n■ 이메일: ${email}\n■ 관심 영역: ${role}\n\n■ 메시지:\n${message}\n`);
      window.location.href = `mailto:smjcreate@naver.com?subject=${subject}&body=${body}`;
      closeModal();
    });

    // IntersectionObserver fade-in
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    root.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // Updated-at ticker
    let updatedSec = 0;
    const updatedEl = root.querySelector<HTMLElement>('#updatedAt');
    const ticker = setInterval(() => {
      updatedSec += 30;
      if (!updatedEl) return;
      if (updatedSec < 60) updatedEl.textContent = '방금 전';
      else if (updatedSec < 3600) updatedEl.textContent = `${Math.floor(updatedSec / 60)}분 전`;
      else updatedEl.textContent = `${Math.floor(updatedSec / 3600)}시간 전`;
    }, 30000);

    return () => {
      window.removeEventListener('resize', applyStickyOffsets);
      document.removeEventListener('keydown', handleKeydown);
      io.disconnect();
      clearInterval(ticker);
    };
  }, []);

  return (
    <div className="wbs-root" ref={rootRef} data-theme="dark">
      {/* ── Header ── */}
      <header className="top" role="banner">
        <div className="top-inner">
          <div className="brand" aria-label="Atlas WBS">
            <div className="brand-mark" aria-hidden="true"></div>
            <a href="/"><span>WBS<span className="brand-sub"></span></span></a>
          </div>
          <div className="top-right">
            <span className="pill"><span className="dot"></span>참여자</span>
            <div className="avatar-stack" aria-label="프로젝트 멤버">
              <span className="av av-1">KJ</span>
              <span className="av av-2">PM</span>
              <span className="av av-3">LS</span>
              <span className="av av-4">CW</span>
              <span className="av av-5">+3</span>
            </div>
            <button className="icon-btn" id="themeToggle" aria-label="테마 전환" title="테마 전환">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
            <button className="icon-btn hamburger" id="menuBtn" aria-label="메뉴 열기" aria-expanded="false">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main role="main">
        {/* ── Project header ── */}
        <section className="proj reveal" aria-labelledby="projTitle">
          <div>
            <h1 className="proj-title" id="projTitle">
              프로젝트 관리 <span className="grad">WBS</span>
            </h1>
            <div className="proj-meta">
              <span><b>ECS_GANTT_TASK</b></span>
              <span>기간 · <b id="projPeriod">—</b></span>
              <span id="projTaskCount">—</span>
              <span>최종 업데이트 · <b id="updatedAt">방금 전</b></span>
            </div>
          </div>
          <div className="proj-actions">
            <button className="btn-secondary" aria-label="필터">＋ 단위업무 추가</button>
            <button className="cta" aria-label="공정 리포트 발송" id="reportBtn">리포트 발송</button>
          </div>
        </section>

        {/* ── KPI ── */}
        <section className="kpis reveal" aria-label="프로젝트 요약 지표">
          <article className="kpi">
            <div className="ring" style={{ ['--p' as string]: '47' }}><span>47%</span></div>
            <div className="kpi-label">전체 공정률</div>
            <div className="kpi-value">47<span className="sub">%</span></div>
            <div className="kpi-delta"><span className="up">▲ 6.2%p</span> &nbsp;지난주 대비</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">완료 / 전체 업무</div>
            <div className="kpi-value">3<span className="sub"> / 12</span></div>
            <div className="kpi-delta">진행 중 6 · 대기 3</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">총 M/D · 가중치 합</div>
            <div className="kpi-value">114<span className="sub"> MD · 100%</span></div>
            <div className="kpi-delta">예측 잔여 60 MD</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">지연 단위업무</div>
            <div className="kpi-value" style={{ color: 'var(--danger)' }}>2<span className="sub" style={{ color: 'var(--text-2)' }}> 건</span></div>
            <div className="kpi-delta"><span className="down">평균 +3.5 일</span> &nbsp;즉시 대응 필요</div>
          </article>
        </section>

        {/* ── Toolbar ── */}
        <div className="toolbar reveal" role="toolbar" aria-label="공정표 필터">
          <div className="seg" role="tablist">
            <button className="on" role="tab" aria-selected="true" data-filter="all">전체</button>
            <button role="tab" aria-selected="false" data-filter="active">진행 중</button>
            <button role="tab" aria-selected="false" data-filter="delay">지연</button>
            <button role="tab" aria-selected="false" data-filter="done">완료</button>
          </div>
          <input className="search" type="search" placeholder="기능 · 담당자 · 산출물 검색" aria-label="공정표 검색" />
          <div className="toolbar-right">
            <span className="legend"><i className="planned"></i>예정</span>
            <span className="legend"><i className="actual"></i>실적</span>
            <span className="legend"><i className="delay"></i>지연</span>
          </div>
        </div>

        {/* ── WBS table ── */}
        <section className="wbs-card reveal" aria-label="WBS 공정표">
          <div className="wbs-scroll" id="wbsScroll" tabIndex={0}>
            <table className="wbs" id="wbsTable" aria-label="작업 분류 체계">
              <colgroup id="wbsCols"></colgroup>
              <thead id="wbsHead"></thead>
              <tbody id="wbsBody"></tbody>
            </table>
          </div>
        </section>
      </main>

      {/* ── Mobile bottom CTA ── */}
      <button className="bottom-cta" id="applyBtnMobile" aria-label="지금 신청하기">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </svg>
        지금 신청하기
      </button>

      {/* ── Mobile menu ── */}
      <div className="sheet-back" id="sheetBack" aria-hidden="true"></div>
      <aside className="sheet" id="sheet" aria-label="모바일 메뉴" aria-hidden="true">
        <button className="icon-btn sheet-close" id="sheetClose" aria-label="메뉴 닫기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <h3>메뉴</h3>
        <a href="#">대시보드</a>
        <a href="#">WBS</a>
        <a href="#">간트차트</a>
        <a href="#">이슈</a>
        <a href="#">리포트</a>
        <h3 style={{ marginTop: 16 }}>프로젝트</h3>
        <a href="#">모바일 커머스 앱 리뉴얼 v2.0</a>
        <a href="#">관리자 콘솔 개편</a>
      </aside>

      {/* ── Apply modal ── */}
      <div className="modal-back" id="modalBack" role="dialog" aria-modal={true} aria-labelledby="modalTitle" aria-hidden="true">
        <form className="modal" id="applyForm">
          <h2 id="modalTitle">프로젝트 참여 신청</h2>
          <p>입력하신 내용은 <b>smjcreate@naver.com</b> 으로 전달됩니다.</p>
          <label className="field"><span>이름</span><input name="name" required autoComplete="name" placeholder="홍길동" /></label>
          <label className="field"><span>이메일</span><input type="email" name="email" required autoComplete="email" placeholder="you@example.com" /></label>
          <label className="field"><span>관심 영역</span>
            <select name="role">
              <option>기획 / PM</option>
              <option>UX / UI 디자인</option>
              <option>프론트엔드 개발</option>
              <option>백엔드 개발</option>
              <option>QA / 테스트</option>
            </select>
          </label>
          <label className="field"><span>메시지</span><textarea name="message" placeholder="간단한 자기소개와 합류 희망 시기를 알려주세요."></textarea></label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" id="modalCancel">취소</button>
            <button type="submit" className="cta">신청 메일 발송</button>
          </div>
        </form>
      </div>
    </div>
  );
}
