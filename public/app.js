/* ==========================================================================
   PIXEL TRADING FLOOR — app.js
   SSE 구독 → 픽셀 오피스 UI 실시간 중계. 바닐라 JS, 외부 라이브러리 없음.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   1. 캐릭터 스프라이트 데이터 (16×16 매트릭스 → 48×48 fillRect, 픽셀=3)
   문자→색 팔레트 방식. '.' 은 투명.
   -------------------------------------------------------------------------- */
const SPRITE_ROWS = [
  "................", // 0
  ".....HHHHHH.....", // 1  머리 위
  "...HHHHHHHHHH...", // 2
  "..HHHHHHHHHHHH..", // 3
  "..HHssssssssHH..", // 4  이마
  "..HssEEssEEssH..", // 5  눈 2px ×2
  "..HssssssssssH..", // 6
  "...ssssMMssss...", // 7  입 2px
  "....ssssssss....", // 8  턱
  "...BBBBBBBBBB...", // 9  어깨
  "..BBBBBBBBBBBB..", // 10 몸통(블롭)
  "..BBBBDDDDBBBB..", // 11 옷 디테일
  "..BBBBBBBBBBBB..", // 12
  "..BBBBBBBBBBBB..", // 13
  "...BBBBBBBBBB...", // 14
  "....BBBBBBBB...."  // 15 둥근 바닥
];

// 캐릭터별 팔레트 + 액세서리(특정 행 오버라이드)
const CHARACTERS = {
  taro: { // 파란 모자 + 헤드셋
    palette: { H:'#3b6fd4', s:'#f0c8a0', E:'#241a2e', M:'#b85c56', B:'#2b4a8a', D:'#1e3566', X:'#22222e' },
    overrides: {
      5: ".XHssEEssEEssHX.", // 헤드셋 이어컵
      6: ".XHssssssssssHX."
    }
  },
  diana: { // 갈색 단발
    palette: { H:'#8a5a34', s:'#f2cda4', E:'#241a2e', M:'#b85c56', B:'#a94f6b', D:'#7d3a52' },
    overrides: { 7: "..HssssMMssssH.." } // 단발이 볼까지
  },
  nova: { // 노란 머리
    palette: { H:'#e8c84a', s:'#f0c8a0', E:'#241a2e', M:'#b85c56', B:'#3f9d78', D:'#2c7357' },
    overrides: {}
  },
  vibe: { // 보라 후드
    palette: { H:'#7a4bc4', s:'#f0c8a0', E:'#241a2e', M:'#b85c56', B:'#5f3a9e', D:'#452b73' },
    overrides: { 7: "..HssssMMssssH.." } // 후드가 얼굴을 감쌈
  },
  bull: { // 주황 몸 + 뿔 2개
    palette: { H:'#e08a3c', s:'#f6b06a', E:'#241a2e', M:'#7a3b1e', B:'#d97b2e', D:'#b25f1c', X:'#f2e9d0' },
    overrides: {
      0: "...X........X...", // 뿔 끝
      1: "..XXHHHHHHHHXX.."  // 뿔 밑동
    }
  },
  bear: { // 빨간 몸 + 둥근 곰귀
    palette: { H:'#c0392b', s:'#e88a7a', E:'#241a2e', M:'#7a2318', B:'#b03328', D:'#8a2418' },
    overrides: {
      1: "..HH........HH.." // 곰귀 2개
    }
  },
  ace: { // 금발 + 선글라스
    palette: { H:'#e8c86a', s:'#f0c8a0', E:'#241a2e', M:'#b85c56', B:'#2a2a34', D:'#c9a84a', X:'#141018' },
    overrides: {
      5: "..HssXXXXXXssH..", // 선글라스
      12: "..BBBBBDDBBBBB.." // 금색 넥타이
    }
  },
  blitz: { // 시안/일렉트릭 블루 + 노란 바이저·번개
    palette: { H:'#22d3ee', s:'#f0c8a0', E:'#241a2e', M:'#0e4a5a', B:'#1f6feb', D:'#22d3ee', X:'#ffd60a' },
    overrides: {
      5:  "..HssXXXXXXssH..", // 노란 바이저
      10: "..BBBBBXXBBBBB..", // 번개 (지그재그)
      11: "..BBBBXXBBBBBB..",
      12: "..BBBXXXXBBBBB..",
      13: "..BBBBBXXBBBBB.."
    }
  },
  guard: { // 스틸 그레이 + 헬멧·방패
    palette: { H:'#9aa4b2', s:'#e8c4a0', E:'#241a2e', M:'#7a5c4a', B:'#4b5563', D:'#374151', X:'#cbd5e1' },
    overrides: {
      4:  "..HHHHHHHHHHHH..", // 헬멧이 이마까지
      10: "..BBBBXXXXBBBB..", // 방패 엠블럼
      11: "..BBBBXXXXBBBB..",
      12: "..BBBBXXXXBBBB..",
      13: "..BBBBBXXBBBBB.."  // 방패 하단 테이퍼
    }
  },
  risky: { // 주황·공격적 — 뾰족한 스파이크 머리 + 상승 화살표
    palette: { H:'#ff7a3c', s:'#f6b06a', E:'#241a2e', M:'#7a3b1e', B:'#e2582a', D:'#b23c18', X:'#ffd60a' },
    overrides: {
      0: "....X..X..X.....", // 스파이크 끝
      1: "...XHHHHHHHHX...",
      11:"..BBBBBXXBBBBB..", // 위로 향한 화살표
      12:"..BBBBXXXXBBBB..",
      13:"..BBBXXXXXXBBB.."
    }
  },
  neutral: { // 회청 — 평평한 저울 느낌
    palette: { H:'#7f93b0', s:'#eec9a4', E:'#241a2e', M:'#6a5040', B:'#5a6b82', D:'#42505f', X:'#c8d4e2' },
    overrides: {
      11:"..BBXXXXXXXXBB..", // 수평 저울대
      12:"..BBBBBXXBBBBB.."
    }
  },
  safe: { // 짙은 청록 + 방패
    palette: { H:'#2f9e8f', s:'#e8c4a0', E:'#241a2e', M:'#5a4436', B:'#1f6d63', D:'#14504a', X:'#a7e8dd' },
    overrides: {
      4: "..HHHHHHHHHHHH..", // 헬멧
      10:"..BBXXXXXXXXBB..", // 큰 방패
      11:"..BBXXXXXXXXBB..",
      12:"..BBBXXXXXXBBB..",
      13:"..BBBBXXXXBBBB.."
    }
  },
  pm: { // 검정 정장 + 금 넥타이 (ACE보다 격식)
    palette: { H:'#3a3a46', s:'#efc9a2', E:'#241a2e', M:'#8a5148', B:'#15151f', D:'#d4af37', X:'#f2f2f8' },
    overrides: {
      9: "...BBBXXXXBBB...", // 흰 셔츠 카라
      10:"..BBBXDDXBBBBB..", // 금 넥타이 매듭
      11:"..BBBBXDDXBBBB..",
      12:"..BBBBBDDBBBBB..",
      13:"..BBBBBDDBBBBB.."
    }
  }
};

const AGENT_IDS = ['taro','diana','nova','vibe','bull','bear','blitz','guard','risky','neutral','safe','ace','pm'];
const NAMES = { taro:'TARO', diana:'DIANA', nova:'NOVA', vibe:'VIBE', bull:'BULL', bear:'BEAR', blitz:'BLITZ', guard:'GUARD', risky:'RISKY', neutral:'NEUTRAL', safe:'SAFE', ace:'ACE', pm:'PM' };
// 콘솔 로그의 이름 배지 색 + 역할 라벨
const AGENT_TINT = {
  taro:'#3b6fd4', diana:'#a94f6b', nova:'#e8c84a', vibe:'#7a4bc4',
  bull:'#e08a3c', bear:'#c0392b', blitz:'#22d3ee', guard:'#9aa4b2',
  risky:'#ff7a3c', neutral:'#7f93b0', safe:'#2f9e8f', ace:'#e8c86a', pm:'#d4af37',
};
const ROLES = {
  taro:'기술적 분석', diana:'기본적 분석', nova:'뉴스 분석', vibe:'센티먼트',
  bull:'매수 논거', bear:'매도 논거', blitz:'스캘퍼', guard:'리스크 관리',
  risky:'공격적 리스크', neutral:'중립적 리스크', safe:'보수적 리스크',
  ace:'수석 트레이더', pm:'포트폴리오 매니저',
};
const DEBATE_IDS = ['bull','bear','risky','neutral','safe'];
const DECISION_COLORS = { BUY:'#3fb950', SELL:'#f85149', HOLD:'#d29922' };
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
// ?still=1 — 타자기 효과를 끄고 즉시 전체 텍스트를 표시한다(스크린샷·문서 캡처용)
const STILL = new URLSearchParams(location.search).get('still') === '1';

/* --------------------------------------------------------------------------
   2. 유틸
   -------------------------------------------------------------------------- */
const qs = (sel) => document.querySelector(sel);
const deskEl = (id) => document.getElementById('desk-' + id);

function drawSprite(canvas, id) {
  const ch = CHARACTERS[id];
  if (!ch || !canvas) return;
  const ctx = canvas.getContext('2d');
  const px = canvas.width / 16; // 48 / 16 = 3
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < 16; r++) {
    const row = (ch.overrides && ch.overrides[r]) || SPRITE_ROWS[r];
    for (let c = 0; c < 16; c++) {
      const color = ch.palette[row[c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(c * px, r * px, px, px);
      }
    }
  }
}

function fmtNumber(n) {
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/,/g, ''));
  if (!isFinite(num)) return String(n);
  const abs = Math.abs(num);
  const maxFrac = abs >= 1 ? 2 : 6;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxFrac });
}

// priceLine 문자열 + candles 에서 가격/등락% 추출 (형식 유연 대응)
function parsePriceLine(line, candles) {
  let price = '', change = '', pct = null;
  if (line) {
    const pctM = String(line).match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    if (pctM) { pct = parseFloat(pctM[1]); change = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'; }
    const priceM = String(line).match(/\$?\s*([\d,]+(?:\.\d+)?)/);
    if (priceM) price = priceM[1];
  }
  if (!price && candles && candles.length) price = fmtNumber(candles[candles.length - 1].c);
  return { price, change, pct };
}

function shortPath(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1];
}

/* --------------------------------------------------------------------------
   3. 말풍선 (타이핑/타자기)
   -------------------------------------------------------------------------- */
const typers = {}; // id -> interval id

function resetBubble(id) {
  const desk = deskEl(id);
  if (!desk) return;
  desk.classList.remove('bounce');
  const b = desk.querySelector('.bubble');
  clearInterval(typers[id]);
  b.classList.remove('show');
  b.textContent = '';
  delete b.dataset.report;
}

function showThinking(id) {
  const desk = deskEl(id);
  if (!desk) return;
  desk.classList.add('bounce');
  const b = desk.querySelector('.bubble');
  clearInterval(typers[id]);
  b.classList.add('show');
  b.innerHTML = '<span class="dots"><i>.</i><i>.</i><i>.</i></span>';
}

function typeBubble(id, text, report) {
  const desk = deskEl(id);
  if (!desk) return;
  desk.classList.remove('bounce');
  const b = desk.querySelector('.bubble');
  clearInterval(typers[id]);
  b.classList.add('show');
  b.dataset.name = NAMES[id] || id.toUpperCase();
  if (report != null && report !== '') b.dataset.report = report;
  const full = String(text || '');
  if (STILL) { b.textContent = full; return; }
  b.textContent = '';
  let i = 0;
  typers[id] = setInterval(() => {
    i += 1;
    b.textContent = full.slice(0, i);
    if (i >= full.length) clearInterval(typers[id]);
  }, 20);
}

/* --------------------------------------------------------------------------
   4. 전광판 + 차트
   -------------------------------------------------------------------------- */
let lastCandles = null; // 리사이즈 재렌더용

function updateBoard(ev) {
  qs('#board-symbol').textContent = ev.display || ev.symbol || '—';
  const p = parsePriceLine(ev.priceLine, ev.candles);
  // 통화 기호는 priceLine을 따른다 (한국주식 ₩, 그 외 $)
  const cur = ev.priceLine && ev.priceLine.includes('₩') ? '₩' : '$';
  qs('#board-price').textContent = p.price ? cur + p.price : (ev.priceLine || '—');
  const chEl = qs('#board-change');
  chEl.textContent = p.change || '';
  chEl.className = (p.pct == null) ? '' : (p.pct >= 0 ? 'up' : 'down');
  lastCandles = ev.candles || null;
  drawChart(ev.candles);
  updateMarketBadge(ev);
  // 콘솔 상단에 수집 완료를 알리는 합성 로그 (서버가 log 이벤트를 안 보내는 구버전 대비)
  if (!serverLogs) {
    pushLog('sys', `> ${ev.display || ev.symbol} 시세 수신 완료`);
    if (ev.priceLine) pushLog('sys', `> ${ev.priceLine}`);
  }

  // 분석 대상이 무기한 선물 페어가 있는 KR 주식이면 전광판도 그 심볼로 맞춘다.
  const sym = String(ev.symbol || '').toUpperCase();
  if ((sym === 'SKHYNIX' || sym === 'SAMSUNG') && sym !== boardSymbol) {
    boardSymbol = sym;
    loadVenueBoard();
  }
}

// 단순이동평균 — 서버를 건드리지 않고 프론트에서 계산한다(구간 부족 구간은 null)
function sma(arr, n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function drawChart(candles) {
  const cv = qs('#chart');
  const rect = cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(rect.width));
  cv.height = Math.max(1, Math.round(rect.height));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (!candles || candles.length < 2) return;

  const closes = candles.map((c) => c.c);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  // 최근 20봉 고·저 — 점선 수평 레벨로 그린다
  const recent = closes.slice(-20);
  const hi20 = Math.max(...recent);
  const lo20 = Math.min(...recent);

  const pool = closes.concat(
    ma20.filter((v) => v != null),
    ma50.filter((v) => v != null),
    [hi20, lo20]
  );
  const min = Math.min(...pool);
  const max = Math.max(...pool);
  const pad = 6;
  const w = cv.width - pad * 2;
  const h = cv.height - pad * 2;
  const up = closes[closes.length - 1] >= closes[0];
  const color = up ? '#3fb950' : '#f85149';
  const X = (i) => pad + (i / (closes.length - 1)) * w;
  const Y = (v) => pad + (1 - (v - min) / ((max - min) || 1)) * h;

  // 배경 픽셀 그리드 점
  ctx.fillStyle = '#161622';
  for (let gx = pad; gx < cv.width - pad; gx += 16) {
    for (let gy = pad; gy < cv.height - pad; gy += 12) ctx.fillRect(gx, gy, 1, 1);
  }

  // 20봉 고·저 점선 레벨
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  [[hi20, '#4d4d5e'], [lo20, '#4d4d5e']].forEach(([v, c]) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(pad, Y(v));
    ctx.lineTo(cv.width - pad, Y(v));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 이동평균선 (MA20 금색 / MA50 파랑)
  const line = (series, c, lw) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    let started = false;
    series.forEach((v, i) => {
      if (v == null) return;
      const px = X(i), py = Y(v);
      started ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), (started = true));
    });
    ctx.stroke();
  };
  line(ma50, '#4a9de8', 1);
  line(ma20, '#e8c84a', 1);

  // 종가 라인
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  closes.forEach((v, i) => { const px = X(i), py = Y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();

  // 마지막 값 점
  const lx = X(closes.length - 1), ly = Y(closes[closes.length - 1]);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(lx) - 3, Math.round(ly) - 3, 6, 6);

  // 하단 날짜 라벨 (처음·중간·끝)
  ctx.fillStyle = '#5a5a72';
  ctx.font = '9px monospace';
  const label = (i, align) => {
    const t = candles[i] && candles[i].t;
    if (!t) return;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return;
    const s = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    ctx.textAlign = align;
    ctx.fillText(s, X(i), cv.height - 2);
  };
  label(0, 'left');
  label(Math.floor((closes.length - 1) / 2), 'center');
  label(closes.length - 1, 'right');
  ctx.textAlign = 'left';
}

// MARKET OPEN/CLOSED 배지 — 통화 기호와 종목 종류로 장 시간을 근사한다(공휴일 무시).
function updateMarketBadge(ev) {
  const badge = qs('#market-badge');
  const text = qs('#market-badge-text');
  if (!badge || !text) return;
  const isKR = !!(ev.priceLine && ev.priceLine.includes('₩'));
  const kind = ev.kind || '';
  let open = false;
  let label = '';
  const inWindow = (tz, fromMin, toMin) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(new Date());
    const get = (t) => (p.find((x) => x.type === t) || {}).value;
    const wd = get('weekday');
    if (wd === 'Sat' || wd === 'Sun') return false;
    const mins = Number(get('hour')) * 60 + Number(get('minute'));
    return mins >= fromMin && mins <= toMin;
  };
  if (kind === 'crypto') {
    open = true;
    label = 'MARKET OPEN · 24H';
  } else if (isKR || kind === 'krstock') {
    open = inWindow('Asia/Seoul', 9 * 60, 15 * 60 + 30);
    label = open ? 'KRX OPEN' : 'KRX CLOSED · 무기한은 24H';
  } else {
    open = inWindow('America/New_York', 9 * 60 + 30, 16 * 60);
    label = open ? 'MARKET OPEN' : 'MARKET CLOSED';
  }
  badge.className = open ? 'open' : 'closed';
  text.textContent = label;
}

/* --------------------------------------------------------------------------
   4.5 에이전트 콘솔 (터미널 로그 — 레퍼런스 릴스의 우측 패널)
   -------------------------------------------------------------------------- */
let serverLogs = false;      // 서버가 log 이벤트를 보내면 true (합성 로그를 끈다)
let consoleFilter = 'all';
let agentLogCount = 0;
let autoScroll = true;
const ctypers = {};          // 콘솔 타이핑 타이머 (key → interval)

function consoleBody() { return qs('#console-body'); }

function nearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

function applyFilter(el) {
  const cat = el.dataset.cat || 'sys';
  let show = true;
  if (consoleFilter === 'agent') show = cat === 'agent' || cat === 'verdict';
  else if (consoleFilter === 'debate') show = cat === 'debate';
  el.style.display = show ? '' : 'none';
}

function appendLog(el, cat) {
  const body = consoleBody();
  if (!body) return null;
  el.dataset.cat = cat;
  applyFilter(el);
  body.appendChild(el);
  if (autoScroll) body.scrollTop = body.scrollHeight;
  else qs('#console-jump').classList.remove('hidden');
  return el;
}

// sys / news / stage / verdict 한 줄
function pushLog(kind, line) {
  const div = document.createElement('div');
  div.className = 'clog ' + kind;
  div.textContent = kind === 'news' ? '▪ ' + line : line;
  appendLog(div, kind === 'stage' ? 'sys' : kind === 'verdict' ? 'verdict' : kind);
  if (kind === 'stage') {
    const st = qs('#cs-stage');
    if (st) st.textContent = line.replace(/─/g, '').trim() || '진행 중';
  }
}

// 에이전트 브리핑 — 이름 배지 + 역할 + 전문(타이핑)
function pushAgentLog(id, report) {
  const tint = AGENT_TINT[id] || '#666';
  const div = document.createElement('div');
  div.className = 'clog agent';
  div.style.setProperty('--tint', tint);
  const head = document.createElement('span');
  head.className = 'who';
  head.textContent = NAMES[id] || id.toUpperCase();
  const role = document.createElement('span');
  role.className = 'role';
  role.textContent = ROLES[id] || '';
  const body = document.createElement('span');
  body.className = 'body';
  div.appendChild(head);
  div.appendChild(role);
  div.appendChild(body);
  appendLog(div, DEBATE_IDS.includes(id) ? 'debate' : 'agent');

  agentLogCount += 1;
  const cnt = qs('#cs-count');
  if (cnt) cnt.textContent = `브리핑 ${agentLogCount}건`;

  // 타이핑 — 길어도 4초 안에 끝나도록 스텝을 키운다
  const text = String(report || '');
  if (STILL) {
    body.textContent = text;
    const bd0 = consoleBody();
    if (bd0) bd0.scrollTop = bd0.scrollHeight;
    return;
  }
  const budget = 4000;
  const step = Math.max(1, Math.ceil(text.length / (budget / 14)));
  let i = 0;
  const key = 'c-' + id + '-' + agentLogCount;
  clearInterval(ctypers[key]);
  ctypers[key] = setInterval(() => {
    i = Math.min(text.length, i + step);
    body.textContent = text.slice(0, i);
    if (i < text.length) {
      const cur = document.createElement('span');
      cur.className = 'cur';
      cur.textContent = '█';
      body.appendChild(cur);
    } else {
      clearInterval(ctypers[key]);
      delete ctypers[key];
    }
    const bd = consoleBody();
    if (autoScroll && bd) bd.scrollTop = bd.scrollHeight;
  }, 14);
}

function resetConsole() {
  const body = consoleBody();
  if (body) body.innerHTML = '';
  Object.keys(ctypers).forEach((k) => { clearInterval(ctypers[k]); delete ctypers[k]; });
  agentLogCount = 0;
  autoScroll = true;
  const jump = qs('#console-jump');
  if (jump) jump.classList.add('hidden');
  const cnt = qs('#cs-count');
  if (cnt) cnt.textContent = '';
}

function initConsole() {
  const body = consoleBody();
  if (body) {
    body.addEventListener('scroll', () => {
      autoScroll = nearBottom(body);
      const jump = qs('#console-jump');
      if (jump) jump.classList.toggle('hidden', autoScroll);
    });
  }
  const jump = qs('#console-jump');
  if (jump) {
    jump.addEventListener('click', () => {
      const b = consoleBody();
      if (b) b.scrollTop = b.scrollHeight;
      autoScroll = true;
      jump.classList.add('hidden');
    });
  }
  document.querySelectorAll('.ctab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ctab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      consoleFilter = tab.dataset.filter || 'all';
      document.querySelectorAll('#console-body .clog').forEach(applyFilter);
    });
  });
}

// 벽면 이퀄라이저 바 생성 (방마다 14개, 서로 다른 주기·색)
function initEqualizers() {
  document.querySelectorAll('.eq').forEach((eq, ri) => {
    eq.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const bar = document.createElement('i');
      if ((i + ri) % 3 === 0) bar.className = 'r';
      bar.style.height = 20 + ((i * 37 + ri * 11) % 70) + '%';
      bar.style.animationDelay = (((i * 7 + ri * 3) % 10) / 10).toFixed(1) + 's';
      bar.style.animationDuration = (0.8 + ((i + ri) % 4) * 0.25).toFixed(2) + 's';
      eq.appendChild(bar);
    }
  });
}

/* --------------------------------------------------------------------------
   5. 판정 패널
   -------------------------------------------------------------------------- */
function resetDecision() {
  const panel = qs('#decision-panel');
  panel.classList.remove('active');
  const a = qs('#dp-action');
  a.textContent = '판정 대기 중';
  a.style.color = '';
  qs('#dp-gauge-fill').style.width = '0';
  qs('#dp-conf').textContent = '';
  qs('#dp-entry').textContent = '—';
  qs('#dp-stop').textContent = '—';
  qs('#dp-target').textContent = '—';
  qs('#dp-rationale').textContent = '';
  const vb = qs('#dp-verdict');
  if (vb) vb.classList.add('hidden');
  resetScalp();
}

function resetScalp() {
  const box = qs('#dp-scalp');
  if (box) box.classList.add('hidden');
  const badge = qs('#dp-scalp-bias');
  if (badge) { badge.textContent = '—'; badge.className = 'scalp-badge'; }
  qs('#dp-scalp-entry').textContent = '—';
  qs('#dp-scalp-stop').textContent = '—';
  qs('#dp-scalp-target').textContent = '—';
  qs('#dp-scalp-note').textContent = '';
}

// decision 이벤트의 선택 필드 scalp:{bias,entry,stop,target,note}
function applyScalp(scalp) {
  const box = qs('#dp-scalp');
  if (!box) return;
  if (!scalp || typeof scalp !== 'object') { resetScalp(); return; }
  const bias = String(scalp.bias || 'PASS').toUpperCase();
  const badge = qs('#dp-scalp-bias');
  badge.textContent = bias;
  const cls = bias === 'LONG' ? 'long' : bias === 'SHORT' ? 'short' : 'pass';
  badge.className = 'scalp-badge ' + cls;
  qs('#dp-scalp-entry').textContent = scalp.entry || '—';
  qs('#dp-scalp-stop').textContent = scalp.stop || '—';
  qs('#dp-scalp-target').textContent = scalp.target || '—';
  qs('#dp-scalp-note').textContent = scalp.note || '';
  box.classList.remove('hidden');
}

function onDecision(ev) {
  const act = String(ev.action || 'HOLD').toUpperCase();
  const col = DECISION_COLORS[act] || DECISION_COLORS.HOLD;
  const panel = qs('#decision-panel');
  panel.classList.add('active');

  const a = qs('#dp-action');
  a.textContent = act;
  a.style.color = col;

  const conf = Math.max(0, Math.min(100, Number(ev.confidence) || 0));
  const fill = qs('#dp-gauge-fill');
  fill.style.width = conf + '%';
  fill.style.background = col;
  qs('#dp-conf').textContent = conf + '%';

  qs('#dp-entry').textContent = ev.entry || '—';
  qs('#dp-stop').textContent = ev.stop || '—';
  qs('#dp-target').textContent = ev.target || '—';
  qs('#dp-rationale').textContent = ev.rationale || '';

  // PM 승인 판정 (algo 모드에서만 옴)
  applyVerdict(ev);

  // 최종 판정 줄은 서버 log 이벤트가 보내준다(구버전 서버일 때만 여기서 보완)
  if (!serverLogs) {
    pushLog('verdict', `>>> 최종 판정 ${act} ${conf}%` + (ev.verdict ? ` · PM ${ev.verdict}` : ''));
  }

  // 스캘핑 플랜 (있을 때만 표시)
  applyScalp(ev.scalp);

  // ACE 말풍선
  typeBubble('ace', '최종 판정: ' + act, ev.report || ev.rationale || '');
}

/* --------------------------------------------------------------------------
   6. 모달 / 토스트
   -------------------------------------------------------------------------- */
function openModal(title, body) {
  qs('#modal-title').textContent = title;
  qs('#modal-body').textContent = body;
  qs('#modal').classList.remove('hidden');
}
function closeModal() { qs('#modal').classList.add('hidden'); }

function toast(msg, kind, href) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  if (href) {
    t.style.cursor = 'pointer';
    t.title = '클릭하면 리포트가 열립니다';
    t.addEventListener('click', () => window.open(href, '_blank'));
  }
  qs('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 300);
  }, href ? 8000 : 3200); // 링크 토스트는 누를 시간을 넉넉히
}

/* --------------------------------------------------------------------------
   7. 실행 상태
   -------------------------------------------------------------------------- */
function setBusy(busy) {
  qs('#analyze-btn').disabled = busy;
}

// 현재 선택된 모드 ('algo' | 'scalp' | 'attack') — 토글 버튼과 동기화
let currentMode = 'algo';

function setMode(mode) {
  currentMode = mode === 'scalp' || mode === 'attack' ? mode : 'algo';
  [['#mode-algo', 'algo'], ['#mode-scalp', 'scalp'], ['#mode-attack', 'attack']].forEach(
    ([sel, m]) => {
      const el = qs(sel);
      if (el) el.classList.toggle('active', currentMode === m);
    }
  );
  // 공격 모드는 화면 전체에 표식을 남긴다 — 판정이 강제된 런임을 영상에서 구분하려고.
  document.body.classList.toggle('attack-mode', currentMode === 'attack');
}

// 모드에 따라 이번 런에서 쉬는 방/자리를 흐리게 표시
function applyModeDim(mode) {
  const dim = (sel, on) => {
    const el = qs(sel);
    if (el) el.classList.toggle('idle', !!on);
  };
  // 공격 모드는 스캘핑과 같은 파이프라인(토론 없음 + 스캘핑 데스크)을 쓴다.
  const scalp = mode === 'scalp' || mode === 'attack';
  dim('#room-research', scalp);          // scalp 모드: 토론 없음
  dim('#desk-diana', scalp);
  dim('#desk-nova', scalp);

  // algo 모드에서는 같은 방이 '리스크 위원회'로 바뀐다(논문의 Risk Management team).
  // 좌석 표시는 CSS의 body.mode-algo 규칙이 담당한다.
  document.body.classList.toggle('mode-algo', !scalp);
  const label = qs('#scalp-room-label');
  if (label) {
    label.textContent = scalp ? '◆ 스캘핑 데스크 ◆ 20x' : '◆ 리스크 위원회 ◆';
  }
  dim('#room-scalp', false);
}

// PM 승인 판정 표시 (algo 모드에서만 온다)
function applyVerdict(ev) {
  const box = qs('#dp-verdict');
  if (!box) return;
  if (!ev || !ev.verdict) { box.classList.add('hidden'); return; }
  const v = String(ev.verdict).toUpperCase();
  const badge = qs('#dp-verdict-badge');
  const LABEL = { APPROVE: 'PM 승인', AMEND: 'PM 수정승인', REJECT: 'PM 기각', PM_FAILED: 'PM 절차 실패' };
  if (badge) {
    badge.textContent = LABEL[v] || ('PM ' + v);
    badge.className = v === 'APPROVE' ? 'approve' : v === 'AMEND' ? 'amend' : v === 'REJECT' ? 'reject' : '';
  }
  const sz = qs('#dp-sizing');
  if (sz) sz.textContent = ev.sizing || '';
  box.classList.remove('hidden');
}

function onRunStart(ev) {
  setBusy(true);
  AGENT_IDS.forEach(resetBubble);
  resetDecision();
  resetConsole();
  if (ev && ev.mode) {
    setMode(ev.mode);
    applyModeDim(ev.mode);
  }
}

function onRunEnd() {
  setBusy(false);
  AGENT_IDS.forEach((id) => { const d = deskEl(id); if (d) d.classList.remove('bounce'); });
}

/* --------------------------------------------------------------------------
   8. SSE 이벤트 라우팅
   -------------------------------------------------------------------------- */
function handleEvent(ev) {
  switch (ev.type) {
    case 'run:start':  onRunStart(ev); break;
    case 'market':     updateBoard(ev); break;
    case 'agent:start': showThinking(ev.id); break;
    case 'agent:done':
      typeBubble(ev.id, ev.bubble || '', ev.report || '');
      pushAgentLog(ev.id, ev.report || ev.bubble || '');
      break;
    case 'log': {
      serverLogs = true;
      const line = ev.line || '';
      // 서버의 최종 판정 줄은 강조 박스로 렌더한다
      const kind = line.startsWith('>>>')
        ? 'verdict'
        : ev.kind === 'news' ? 'news' : ev.kind === 'stage' ? 'stage' : 'sys';
      pushLog(kind, line);
      break;
    }
    case 'decision':   onDecision(ev); break;
    case 'saved':      toast('리포트 저장됨(클릭해서 열기): ' + shortPath(ev.path), 'ok', '/reports/' + encodeURIComponent(shortPath(ev.path))); break;
    case 'run:error':  toast(ev.message || '오류가 발생했습니다', 'err'); break;
    case 'run:end':    onRunEnd(); break;
    default: break;
  }
}

function connectStream() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch (_) { return; }
    handleEvent(ev);
  };
  es.onerror = () => { /* 브라우저가 자동 재연결 */ };
}

/* --------------------------------------------------------------------------
   9. 분석 요청
   -------------------------------------------------------------------------- */
async function analyze() {
  const sym = qs('#symbol-input').value.trim();
  if (!sym) { toast('심볼을 입력하세요', 'err'); return; }
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: sym, demo: DEMO, mode: currentMode })
    });
    if (res.status === 409) { toast('이미 분석 중입니다', 'err'); return; }
    if (!res.ok) { toast('요청 실패 (' + res.status + ')', 'err'); return; }
    // 202 성공 — 이후 UI 는 SSE 가 구동
  } catch (_) {
    toast('서버에 연결할 수 없습니다', 'err');
  }
}

/* --------------------------------------------------------------------------
   10. 시계
   -------------------------------------------------------------------------- */
function fmtClock(tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date());
}
function tickClocks() {
  qs('#clock-nyc').textContent = fmtClock('America/New_York');
  qs('#clock-ldn').textContent = fmtClock('Europe/London');
  qs('#clock-sel').textContent = fmtClock('Asia/Seoul');
}

/* --------------------------------------------------------------------------
   11. 티커 테이프
   -------------------------------------------------------------------------- */
function renderTape(items) {
  if (!Array.isArray(items) || !items.length) return;
  const make = () => items.map((it) => {
    const pct = Number(it.changePct);
    const sign = pct >= 0 ? '+' : '';
    const cls = pct >= 0 ? 'up' : 'down';
    const pctTxt = isFinite(pct) ? sign + pct.toFixed(2) + '%' : '';
    return '<span class="tape-item"><b>' + it.sym + '</b> $' + fmtNumber(it.price) +
           ' <span class="' + cls + '">' + pctTxt + '</span></span>';
  }).join('');
  // 콘텐츠 2벌 이어붙여 seamless 스크롤 (-50% 애니메이션과 정합)
  qs('#tape-track').innerHTML = make() + make();
}
/* --------------------------------------------------------------------------
   11-b. 멀티 거래소 전광판
   -------------------------------------------------------------------------- */
let boardSymbol = 'SKHYNIX'; // 전광판 대상 (분석 심볼이 KR 주식이면 따라간다)

function vbPrice(row) {
  if (row.price == null || !isFinite(row.price)) return '—';
  const cs = row.cs || '';
  if (row.decimals != null) {
    return cs + Number(row.price).toLocaleString('en-US', {
      minimumFractionDigits: row.decimals,
      maximumFractionDigits: row.decimals,
    });
  }
  return cs + fmtNumber(row.price);
}

function renderVenueBoard(data) {
  const wrap = qs('#vb-rows');
  if (!wrap) return;
  const rows = (data && data.rows) || [];
  if (!rows.length) {
    wrap.innerHTML =
      '<div class="vb-row vb-dead"><span class="vb-label">전광판</span>' +
      '<span class="vb-price">—</span><span class="vb-pct"></span>' +
      '<span class="vb-note">' +
      ((data && (data.note || data.error)) || '데이터 없음') +
      '</span></div>';
    return;
  }
  wrap.innerHTML = rows.map((r) => {
    const pct = Number(r.changePct);
    const hasPct = isFinite(pct) && r.changePct != null;
    const cls = hasPct ? (pct >= 0 ? 'up' : 'down') : '';
    const pctTxt = hasPct ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '';
    const extra = [];
    if (r.krw != null) extra.push('₩' + fmtNumber(r.krw));
    if (r.usd != null) extra.push('$' + fmtNumber(r.usd));
    if (r.fundingPct != null) extra.push('펀딩 ' + (r.fundingPct >= 0 ? '+' : '') + r.fundingPct.toFixed(4) + '%');
    if (r.index != null) extra.push('지수 ' + fmtNumber(r.index));
    const note = extra.length ? extra.join(' · ') : (r.note || '');
    const kind =
      r.key === 'premium' ? ' vb-premium'
      : r.estimated ? ' vb-est'
      : r.price == null ? ' vb-dead' : '';
    return (
      '<div class="vb-row' + kind + '">' +
      '<span class="vb-label">' + esc(r.label) + '</span>' +
      '<span class="vb-price">' + vbPrice(r) + '</span>' +
      '<span class="vb-pct ' + cls + '">' + pctTxt + '</span>' +
      '<span class="vb-note" title="' + esc(r.note || '') + '">' + esc(note) + '</span>' +
      '</div>'
    );
  }).join('');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadVenueBoard() {
  try {
    const res = await fetch('/api/board?symbol=' + encodeURIComponent(boardSymbol));
    if (!res.ok) return;
    const data = await res.json();
    renderVenueBoard(data);
    const sub = qs('#vb-sub');
    if (sub) {
      sub.textContent = data.nameKo
        ? `${data.nameKo} · 탭비트 ${data.tapbitPair} 기준`
        : (data.note || '');
    }
    const stamp = qs('#vb-stamp');
    if (stamp) {
      const d = new Date();
      stamp.textContent = `갱신 ${String(d.getHours()).padStart(2, '0')}:` +
        `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }
  } catch (_) { /* 무시 — 다음 폴링에서 재시도 */ }
}

async function loadTape() {
  try {
    const res = await fetch('/api/tape');
    if (!res.ok) return;
    renderTape(await res.json());
  } catch (_) { /* 무시 — 다음 폴링에서 재시도 */ }
}

/* --------------------------------------------------------------------------
   12. 초기화
   -------------------------------------------------------------------------- */
function init() {
  // 스프라이트 렌더
  AGENT_IDS.forEach((id) => {
    const desk = deskEl(id);
    if (desk) drawSprite(desk.querySelector('.sprite'), id);
  });

  // 시계
  tickClocks();
  setInterval(tickClocks, 1000);

  // 티커
  loadTape();
  setInterval(loadTape, 60000);

  // 전광판 (서버 캐시 15초에 맞춰 폴링)
  loadVenueBoard();
  setInterval(loadVenueBoard, 15000);
  const vbToggle = qs('#vb-toggle');
  if (vbToggle) {
    vbToggle.addEventListener('click', () => {
      const box = qs('#venue-board');
      const hidden = box.classList.toggle('collapsed');
      vbToggle.textContent = hidden ? '펼치기' : '접기';
    });
  }

  // 컨트롤
  qs('#analyze-btn').addEventListener('click', analyze);
  qs('#symbol-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(); });

  // 모드 토글
  const algoBtn = qs('#mode-algo');
  const scalpBtn = qs('#mode-scalp');
  const attackBtn = qs('#mode-attack');
  if (algoBtn) algoBtn.addEventListener('click', () => { setMode('algo'); applyModeDim('algo'); });
  if (scalpBtn) scalpBtn.addEventListener('click', () => { setMode('scalp'); applyModeDim('scalp'); });
  if (attackBtn) attackBtn.addEventListener('click', () => { setMode('attack'); applyModeDim('attack'); });
  applyModeDim(currentMode);

  // 말풍선 클릭 → 모달
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.bubble');
    if (b && b.dataset.report) openModal(b.dataset.name || '리포트', b.dataset.report);
  });
  qs('#modal-close').addEventListener('click', closeModal);
  qs('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // 차트 리사이즈 대응 (마지막 candles 재렌더)
  window.addEventListener('resize', () => { if (lastCandles) drawChart(lastCandles); });

  // 에이전트 콘솔 + 벽면 이퀄라이저
  initConsole();
  initEqualizers();

  // SSE 연결 (현재 상태 replay 후 구독)
  connectStream();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
