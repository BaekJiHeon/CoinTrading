'use strict';

// PIXEL TRADING FLOOR — 분석 엔진
// 티커 입력 → 시장 데이터 수집 → 애널리스트 4명 병렬 분석 → BULL/BEAR 토론 4턴
// → ACE 최종 판정 → 리포트 저장. 모든 단계를 'event' 이벤트로 방송하고
// history 배열에 누적해 새 SSE 구독자에게 replay 한다.

const EventEmitter = require('events');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const { resolveSymbol, fetchMarket } = require('./market');
const { AGENTS, runAgent } = require('./agents');

const ANALYST_IDS = ['taro', 'diana', 'nova', 'vibe'];
const DEBATE_ORDER = ['bull', 'bear', 'bull', 'bear'];
const SCALP_ORDER = ['blitz', 'guard']; // 순차: guard는 blitz 결과를 받음

// 모드별 파이프라인 구성
// - algo  : 논문(TradingAgents) 파이프라인 그대로 — 애널리스트 4 → 토론 4턴 → ACE (스캘핑 없음)
// - scalp : 탭비트 20배 단타 — 기술·심리 2명 → BLITZ → GUARD → ACE (토론 없음, 빠름)
// - attack: scalp와 같은 파이프라인이되 PASS/HOLD 금지 — 반드시 LONG 또는 SHORT가 나온다.
//           (연출·시연용. 관망이라는 선택지를 없애는 것이므로 리스크 고지는 그대로 유지한다.)
// 리스크 위원회 — 순차. 뒤에 오는 심사자가 앞의 의견을 받아 반박한다.
// (논문의 Risk Management team: 공격적/보수적이 먼저 붙고 중립이 중재한다)
const RISK_ORDER = ['risky', 'safe', 'neutral'];

const MODES = {
  algo: {
    analysts: ANALYST_IDS,
    debate: DEBATE_ORDER,
    scalp: [],
    risk: RISK_ORDER, // ACE 1차 판정 → 리스크 위원회 → PM 최종 승인
    pm: true,
  },
  scalp: { analysts: ['taro', 'vibe'], debate: [], scalp: SCALP_ORDER, risk: [], pm: false },
  attack: { analysts: ['taro', 'vibe'], debate: [], scalp: SCALP_ORDER, risk: [], pm: false },
};
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

function pad2(n) {
  return String(n).padStart(2, '0');
}

// AGENTS(배열 또는 객체) → id 로 메타를 찾을 수 있는 조회 함수
function buildAgentMeta() {
  const map = {};
  if (Array.isArray(AGENTS)) {
    for (const a of AGENTS) {
      if (a && a.id) map[a.id] = a;
    }
  } else if (AGENTS && typeof AGENTS === 'object') {
    for (const key of Object.keys(AGENTS)) {
      const a = AGENTS[key];
      if (a && typeof a === 'object') map[a.id || key] = a;
    }
  }
  return map;
}

const AGENT_META = buildAgentMeta();

function metaLabel(id) {
  const m = AGENT_META[id];
  const name = (m && (m.name || m.nameKo)) || id.toUpperCase();
  const role = (m && (m.role || m.roomKo)) || '';
  return role ? `${name} (${role})` : name;
}

class Engine extends EventEmitter {
  constructor() {
    super();
    // 다수의 SSE 구독자가 리스너를 붙이므로 상한 경고를 끈다.
    this.setMaxListeners(0);
    this.history = [];
    this.running = false;
  }

  // history 에 누적하면서 실시간 방송
  _emit(evt) {
    this.history.push(evt);
    this.emit('event', evt);
  }

  // 콘솔용 로그 한 줄. kind: 'sys' | 'news' | 'stage'
  _log(line, kind = 'sys') {
    if (!line) return;
    this._emit({ type: 'log', kind, line: String(line) });
  }

  // 과거 판정 회고(reflection) — decisions.json에서 같은 심볼 최근 3건을 읽고
  // 그 이후 가격이 어떻게 흘렀는지 일봉으로 계산해 문장으로 만든다.
  // 어떤 이유로 실패해도 런을 죽이지 않는다(회고는 부가 기능).
  async _buildMemory(resolved, market) {
    try {
      const raw = await fsp.readFile(path.join(REPORTS_DIR, 'decisions.json'), 'utf8');
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      const display = String(resolved.display);
      const past = arr
        .filter((d) => d && String(d.symbol) === display && d.ts)
        .slice(-3);
      if (!past.length) return null;

      const candles = Array.isArray(market && market.candles) ? market.candles : [];
      const nowPrice =
        (market && market.indicators && market.indicators.price) ||
        (candles.length ? candles[candles.length - 1].c : null);

      const out = past.map((d) => {
        const when = String(d.ts).slice(0, 16).replace('T', ' ');
        const head =
          `${when} · ${d.mode || 'algo'} · ${d.action || '-'}` +
          (d.confidence != null ? `(${d.confidence}%)` : '') +
          (d.scalpBias ? ` · 스캘핑 ${d.scalpBias}` : '');
        const then = Date.parse(d.ts);
        // 판정 시각 이후의 첫 일봉 종가를 기준으로 현재까지의 변화율
        const after = candles.filter((c) => c && c.t >= then);
        if (!Number.isFinite(then) || after.length < 2 || nowPrice == null) {
          return `${head} → 이후 흐름 데이터 부족`;
        }
        const base = after[0].c;
        if (!base) return `${head} → 이후 흐름 데이터 부족`;
        const pct = ((nowPrice - base) / base) * 100;
        const days = Math.max(1, Math.round((Date.now() - then) / 86400000));
        return `${head} → 이후 ${days}일간 ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      });
      return out.length ? out : null;
    } catch (_) {
      return null;
    }
  }

  async run(symbolInput, opts = {}) {
    if (this.running) {
      const err = new Error('이미 분석이 진행 중입니다.');
      err.code = 409;
      throw err;
    }
    this.running = true;
    this.history = []; // run:start 시점에 히스토리 리셋

    const mock = !!opts.mock;
    const mode = MODES[opts.mode] ? opts.mode : 'algo';
    const plan = MODES[mode];
    let resolved = null;
    let market = null;
    const analystResults = []; // [{id, name, bubble, report}] — 렌더/저장용
    const analystReports = {}; // {taro,diana,nova,vibe: reportString} — agents.js 프롬프트 주입용
    const debateLog = [];
    const scalpResults = []; // [{id, name, bubble, report}] — 스캘핑 데스크 렌더/저장용
    const scalpReports = {}; // {blitz, guard: reportString} — agents.js 프롬프트 주입용
    const riskResults = []; // [{id, name, bubble, report}] — 리스크 위원회 렌더/저장용
    const riskReports = {}; // {risky, safe, neutral: reportString}
    let memory = null; // 과거 판정 회고
    let pmResult = null; // 포트폴리오 매니저 결과
    let decision = null;

    try {
      resolved = resolveSymbol(symbolInput);
      this._emit({
        type: 'run:start',
        symbol: resolved.symbol,
        display: resolved.display,
        mock,
        mode,
      });

      // 1) 시장 데이터
      this._log(`> Fetching ${resolved.display} data...`);
      market = await fetchMarket(resolved);
      const candles = (Array.isArray(market.candles) ? market.candles : [])
        .slice(-120)
        .map((c) => ({ t: c.t, c: c.c }));
      this._emit({
        type: 'market',
        priceLine: market.priceLine,
        candles,
        display: resolved.display,
        kind: resolved.kind,
      });

      // 콘솔 중계용 로그 — 수집 결과를 사람이 읽는 순서대로 흘린다
      this._log('> 실시간 시세 수신 완료');
      if (market.priceLine) this._log(`> ${market.priceLine}`);
      for (const l of (market.indicators && market.indicators.summaryLines) || []) {
        this._log(`> ${l}`);
      }
      if (market.perp && market.perp.priceLine) {
        this._log(`> [무기한] ${market.perp.priceLine}`);
      }
      for (const l of (market.intraday && market.intraday.summaryLines) || []) {
        this._log(`> ${l}`);
      }
      for (const h of ((market.news && market.news.headlines) || []).slice(0, 6)) {
        this._log(`${h.title}${h.age ? ` (${h.age})` : ''}`, 'news');
      }

      // 과거 판정 회고(있으면 ACE·PM 프롬프트에 주입)
      memory = await this._buildMemory(resolved, market);
      if (memory) {
        this._log('── 과거 판정 회고 ──', 'stage');
        for (const l of memory) this._log(`> ${l}`);
      }

      // 2) 애널리스트 병렬 (Promise.allSettled) — 모드별 인원
      this._log('── 애널리스트 팀 분석 ──', 'stage');
      const tasks = plan.analysts.map(async (id) => {
        this._emit({ type: 'agent:start', id });
        try {
          const res = await runAgent(id, { market, mode }, { mock });
          this._emit({
            type: 'agent:done',
            id,
            bubble: res.bubble,
            report: res.report,
          });
          return { id, name: metaLabel(id), bubble: res.bubble, report: res.report };
        } catch (e) {
          const bubble = '분석 실패';
          const report = '(오류) ' + (e && e.message ? e.message : String(e));
          this._emit({ type: 'agent:done', id, bubble, report });
          return { id, name: metaLabel(id), bubble, report };
        }
      });
      const settled = await Promise.allSettled(tasks);
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) {
          analystResults.push(s.value);
          analystReports[s.value.id] = s.value.report;
        }
      }

      // 3) BULL/BEAR 토론 순차 (algo 모드: bull→bear→bull→bear, scalp 모드: 생략)
      if (plan.debate.length) this._log('── 리서치 토론 (BULL vs BEAR) ──', 'stage');
      for (let i = 0; i < plan.debate.length; i++) {
        const id = plan.debate[i];
        const turn = i + 1;
        this._emit({ type: 'agent:start', id, turn });
        const res = await runAgent(
          id,
          { market, analystReports, debateLog, mode },
          { mock }
        );
        this._emit({
          type: 'agent:done',
          id,
          turn,
          bubble: res.bubble,
          report: res.report,
        });
        debateLog.push({
          id,
          turn,
          name: metaLabel(id),
          bubble: res.bubble,
          report: res.report,
        });
      }

      // 3.5) 스캘핑 데스크 (scalp 모드 전용: blitz → guard 순차, guard는 blitz 리포트를 받음)
      // 실패 정책: 애널리스트와 동일하게 '분석 실패'로 계속 진행한다.
      if (plan.scalp.length) this._log('── 스캘핑 데스크 (20x) ──', 'stage');
      for (const id of plan.scalp) {
        this._emit({ type: 'agent:start', id });
        try {
          const res = await runAgent(
            id,
            { market, analystReports, debateLog, scalpReports, mode },
            { mock }
          );
          this._emit({
            type: 'agent:done',
            id,
            bubble: res.bubble,
            report: res.report,
          });
          scalpReports[id] = res.report;
          scalpResults.push({
            id,
            name: metaLabel(id),
            bubble: res.bubble,
            report: res.report,
          });
        } catch (e) {
          const bubble = '분석 실패';
          const report = '(오류) ' + (e && e.message ? e.message : String(e));
          this._emit({ type: 'agent:done', id, bubble, report });
          scalpReports[id] = report;
          scalpResults.push({ id, name: metaLabel(id), bubble, report });
        }
      }

      // 4) ACE 판정 (algo 모드에서는 1차 계획 — 뒤에 리스크 위원회·PM 심사가 붙는다)
      this._log(
        plan.pm ? '── 수석 트레이더 1차 판정 ──' : '── 최종 판정 ──',
        'stage'
      );
      this._emit({ type: 'agent:start', id: 'ace' });
      const dec = await runAgent(
        'ace',
        { market, analystReports, debateLog, scalpReports, memory, mode },
        { mock }
      );
      this._emit({
        type: 'agent:done',
        id: 'ace',
        bubble: dec.bubble,
        report: dec.report,
      });

      // 4.5) 리스크 위원회 (algo 모드 전용) — ACE 1차 계획을 성향별로 심사하고 서로 반박
      const traderPlan = {
        action: dec.action,
        confidence: dec.confidence,
        entry: dec.entry,
        stop: dec.stop,
        target: dec.target,
        rationale: dec.rationale,
        scalp: dec.scalp,
      };
      if (plan.risk.length) this._log('── 리스크 위원회 심사 ──', 'stage');
      for (const id of plan.risk) {
        this._emit({ type: 'agent:start', id });
        try {
          const res = await runAgent(
            id,
            { market, analystReports, debateLog, traderPlan, riskReports, mode },
            { mock }
          );
          this._emit({ type: 'agent:done', id, bubble: res.bubble, report: res.report });
          riskReports[id] = res.report;
          riskResults.push({ id, name: metaLabel(id), bubble: res.bubble, report: res.report });
        } catch (e) {
          const bubble = '분석 실패';
          const report = '(오류) ' + (e && e.message ? e.message : String(e));
          this._emit({ type: 'agent:done', id, bubble, report });
          riskReports[id] = report;
          riskResults.push({ id, name: metaLabel(id), bubble, report });
        }
      }

      // 4.6) 포트폴리오 매니저 최종 승인 (algo 모드 전용)
      // PM이 실패하면 ACE 판정을 그대로 최종으로 쓰고 그 사실을 리포트에 남긴다.
      if (plan.pm) {
        this._log('── 포트폴리오 매니저 최종 승인 ──', 'stage');
        this._emit({ type: 'agent:start', id: 'pm' });
        try {
          const res = await runAgent(
            'pm',
            { market, analystReports, debateLog, traderPlan, riskReports, memory, mode },
            { mock }
          );
          this._emit({ type: 'agent:done', id: 'pm', bubble: res.bubble, report: res.report });
          pmResult = {
            name: metaLabel('pm'),
            bubble: res.bubble,
            report: res.report,
            verdict: String(res.verdict || 'APPROVE').toUpperCase(),
            action: res.action,
            confidence: res.confidence,
            entry: res.entry,
            stop: res.stop,
            target: res.target,
            sizing: res.sizing || '',
            rationale: res.rationale || '',
          };
        } catch (e) {
          const report = '(오류) ' + (e && e.message ? e.message : String(e));
          this._emit({ type: 'agent:done', id: 'pm', bubble: '승인 절차 실패', report });
          pmResult = { failed: true, name: metaLabel('pm'), bubble: '승인 절차 실패', report };
        }
      }

      // 공격 모드에서 모델이 그래도 PASS를 뱉으면, 방향을 강제한다는 모드의 계약이
      // 깨진다. 기술 지표(SMA20 대비 위치)로 우위 쪽을 골라 채워 넣는다.
      const forceBias = () => {
        const i = (market && market.perp && market.perp.indicators) ||
          (market && market.indicators) || {};
        if (i.price != null && i.sma20 != null) return i.price >= i.sma20 ? 'LONG' : 'SHORT';
        return (i.changePct24h || 0) >= 0 ? 'LONG' : 'SHORT';
      };
      const attack = mode === 'attack';
      // scalp 판정은 스캘핑 데스크가 실제로 돈 모드에서만 채택한다
      // (mock ACE가 항상 scalp를 돌려줘도 algo 모드에서는 버린다)
      const scalp =
        plan.scalp.length > 0 && dec.scalp && typeof dec.scalp === 'object'
          ? {
              bias: (() => {
                const b = (dec.scalp.bias || 'PASS').toUpperCase();
                if (attack && b !== 'LONG' && b !== 'SHORT') return forceBias();
                return b;
              })(),
              entry: dec.scalp.entry != null ? dec.scalp.entry : '-',
              stop: dec.scalp.stop != null ? dec.scalp.stop : '-',
              target: dec.scalp.target != null ? dec.scalp.target : '-',
              note: dec.scalp.note != null ? dec.scalp.note : '',
            }
          : null;
      decision = {
        action: (() => {
          const a = (dec.action || 'HOLD').toUpperCase();
          // 공격 모드는 HOLD를 허용하지 않는다 — scalp 편향과 같은 쪽으로 정렬한다.
          if (attack && a !== 'BUY' && a !== 'SELL') {
            const b = (scalp && scalp.bias) || forceBias();
            return b === 'LONG' ? 'BUY' : 'SELL';
          }
          return a;
        })(),
        confidence:
          typeof dec.confidence === 'number'
            ? dec.confidence
            : Number(dec.confidence) || 0,
        entry: dec.entry != null ? dec.entry : '-',
        stop: dec.stop != null ? dec.stop : '-',
        target: dec.target != null ? dec.target : '-',
        rationale: dec.rationale != null ? dec.rationale : dec.report || '',
        report: dec.report != null ? dec.report : '',
        bubble: dec.bubble,
        scalp,
      };

      // 4.7) PM 판정을 최종 결정에 반영
      //  - APPROVE : ACE 계획 그대로
      //  - AMEND   : PM이 준 값으로 교체(빈 값은 ACE 값 유지)
      //  - REJECT  : action을 HOLD로 강제하고 기각 사유를 근거로
      if (pmResult && !pmResult.failed) {
        const v = pmResult.verdict;
        decision.verdict = v;
        if (pmResult.sizing) decision.sizing = pmResult.sizing;
        if (v === 'AMEND') {
          const a = String(pmResult.action || '').toUpperCase();
          if (['BUY', 'SELL', 'HOLD'].includes(a)) decision.action = a;
          if (typeof pmResult.confidence === 'number') decision.confidence = pmResult.confidence;
          if (pmResult.entry) decision.entry = pmResult.entry;
          if (pmResult.stop) decision.stop = pmResult.stop;
          if (pmResult.target) decision.target = pmResult.target;
          if (pmResult.rationale) {
            decision.rationale = `[PM 수정승인] ${pmResult.rationale}`;
          }
        } else if (v === 'REJECT') {
          decision.action = 'HOLD';
          decision.rationale = `[PM 기각] ${pmResult.rationale || '리스크 위원회 의견을 반영해 실행을 기각했습니다.'}`;
        } else if (pmResult.rationale) {
          decision.rationale = `${decision.rationale} [PM 승인] ${pmResult.rationale}`;
        }
      } else if (pmResult && pmResult.failed) {
        decision.verdict = 'PM_FAILED';
      }

      const decisionEvt = {
        type: 'decision',
        action: decision.action,
        confidence: decision.confidence,
        entry: decision.entry,
        stop: decision.stop,
        target: decision.target,
        rationale: decision.rationale,
        report: decision.report,
      };
      if (decision.scalp) decisionEvt.scalp = decision.scalp;
      if (decision.verdict) decisionEvt.verdict = decision.verdict;
      if (decision.sizing) decisionEvt.sizing = decision.sizing;
      this._emit(decisionEvt);
      this._log(
        `>>> 최종 판정: ${decision.action} (${decision.confidence}%)` +
          (decision.verdict ? ` · PM ${decision.verdict}` : ''),
        'stage'
      );

      // 5) 저장
      const savedPath = await this._save(
        resolved,
        market,
        mock,
        mode,
        analystResults,
        debateLog,
        scalpResults,
        riskResults,
        pmResult,
        memory,
        decision
      );
      this._emit({ type: 'saved', path: savedPath });
    } catch (err) {
      this._emit({
        type: 'run:error',
        message: err && err.message ? err.message : String(err),
      });
    } finally {
      this._emit({ type: 'run:end' });
      this.running = false;
    }
  }

  // 리포트(.md) + decisions.json 저장. 반환: 방송용 상대 경로
  async _save(resolved, market, mock, mode, analystResults, debateLog, scalpResults, riskResults, pmResult, memory, decision) {
    await fsp.mkdir(REPORTS_DIR, { recursive: true });

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
      now.getDate()
    )}`;
    const hhmm = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
    const safeDisplay =
      String(resolved.display).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) ||
      'SYMBOL';
    const fname = `${dateStr}-${safeDisplay}-${hhmm}.md`;
    const fullPath = path.join(REPORTS_DIR, fname);

    const md = this._renderMarkdown(
      resolved,
      market,
      mock,
      mode,
      analystResults,
      debateLog,
      scalpResults,
      riskResults,
      pmResult,
      memory,
      decision,
      now
    );
    await fsp.writeFile(fullPath, md, 'utf8');

    // decisions.json append
    const decPath = path.join(REPORTS_DIR, 'decisions.json');
    let arr = [];
    try {
      const raw = await fsp.readFile(decPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch (_) {
      arr = [];
    }
    arr.push({
      ts: now.toISOString(),
      symbol: resolved.display,
      mode,
      action: decision.action,
      confidence: decision.confidence,
      verdict: decision.verdict || null,
      scalpBias:
        decision.scalp && decision.scalp.bias
          ? String(decision.scalp.bias).toUpperCase()
          : null,
    });
    await fsp.writeFile(decPath, JSON.stringify(arr, null, 2), 'utf8');

    return `reports/${fname}`;
  }

  _renderMarkdown(resolved, market, mock, mode, analystResults, debateLog, scalpResults, riskResults, pmResult, memory, decision, now) {
    const modeLabel =
      mode === 'attack'
        ? '⚔ 공격(탭비트 20x · 방향 강제)'
        : mode === 'scalp'
        ? '스캘핑(탭비트 20x 단타)'
        : '알고리즘(논문 파이프라인)';
    const lines = [];
    lines.push(`# PIXEL TRADING FLOOR 분석 리포트`);
    lines.push('');
    lines.push(`- 심볼: ${resolved.display} (${resolved.symbol}, ${resolved.kind})`);
    lines.push(`- 시각: ${now.toISOString()}`);
    lines.push(`- 모드: ${modeLabel} · ${mock ? '데모(시뮬레이션 목업)' : '실전(claude opus)'}`);
    if (market && market.priceLine) lines.push(`- 시세: ${market.priceLine}`);
    if (market && market.perp && market.perp.priceLine) {
      lines.push(`- 시세(체결 기준): ${market.perp.priceLine}`);
    }
    if (mode === 'attack') {
      lines.push(
        '- ⚠ 공격 모드: 관망(PASS/HOLD)을 금지하고 반드시 방향을 고르게 한 런이다. ' +
          '우위가 미약해도 한쪽이 선택되므로, 확신도와 무효화 레벨을 함께 보지 않으면 오독하기 쉽다.'
      );
    }
    lines.push('');
    if (market && market.board && Array.isArray(market.board.lines) && market.board.lines.length) {
      lines.push('## 멀티 거래소 전광판');
      lines.push('');
      for (const l of market.board.lines) lines.push(`- ${l}`);
      lines.push('');
    }

    lines.push('## 애널리스트 리포트');
    lines.push('');
    for (const r of analystResults) {
      lines.push(`### ${r.name}`);
      lines.push(`> ${r.bubble || ''}`);
      lines.push('');
      lines.push(r.report || '(리포트 없음)');
      lines.push('');
    }

    if (debateLog.length) {
      lines.push('## 리서치 토론 (BULL vs BEAR)');
      lines.push('');
    }
    for (const d of debateLog) {
      lines.push(`### 턴 ${d.turn} — ${d.name}`);
      lines.push(`> ${d.bubble || ''}`);
      lines.push('');
      lines.push(d.report || '(리포트 없음)');
      lines.push('');
    }

    if (Array.isArray(scalpResults) && scalpResults.length) {
      lines.push('## 스캘핑 데스크 (20x)');
      lines.push('');
      for (const r of scalpResults) {
        lines.push(`### ${r.name}`);
        lines.push(`> ${r.bubble || ''}`);
        lines.push('');
        lines.push(r.report || '(리포트 없음)');
        lines.push('');
      }
    }

    if (Array.isArray(riskResults) && riskResults.length) {
      lines.push('## 리스크 위원회');
      lines.push('');
      for (const r of riskResults) {
        lines.push(`### ${r.name}`);
        lines.push(`> ${r.bubble || ''}`);
        lines.push('');
        lines.push(r.report || '(리포트 없음)');
        lines.push('');
      }
    }

    if (pmResult) {
      lines.push('## 포트폴리오 매니저 승인');
      lines.push('');
      if (pmResult.failed) {
        lines.push('- 판정: **승인 절차 실패** — 수석 트레이더(ACE)의 판정을 그대로 최종으로 사용했습니다.');
        lines.push('');
        lines.push(pmResult.report || '');
        lines.push('');
      } else {
        lines.push(`- 판정: **${pmResult.verdict}**`);
        if (pmResult.sizing) lines.push(`- 권장 비중: ${pmResult.sizing}`);
        if (pmResult.rationale) lines.push(`- 근거: ${pmResult.rationale}`);
        lines.push('');
        lines.push(`> ${pmResult.bubble || ''}`);
        lines.push('');
        lines.push(pmResult.report || '(리포트 없음)');
        lines.push('');
      }
    }

    if (Array.isArray(memory) && memory.length) {
      lines.push('## 과거 판정 회고');
      lines.push('');
      for (const m of memory) lines.push(`- ${m}`);
      lines.push('');
    }

    lines.push(
      pmResult && !pmResult.failed ? '## 최종 판정 (ACE → PM 승인)' : '## 최종 판정 (ACE)'
    );
    lines.push('');
    lines.push(`- 액션: **${decision.action}**`);
    if (decision.verdict) lines.push(`- PM 판정: ${decision.verdict}`);
    if (decision.sizing) lines.push(`- 권장 비중: ${decision.sizing}`);
    lines.push(`- 확신도: ${decision.confidence}%`);
    lines.push(`- 진입: ${decision.entry}`);
    lines.push(`- 손절: ${decision.stop}`);
    lines.push(`- 목표: ${decision.target}`);
    lines.push(`- 근거: ${decision.rationale}`);
    lines.push('');
    if (decision.scalp) {
      const s = decision.scalp;
      lines.push('### 스캘핑 판정 (탭비트 20x)');
      lines.push(`- 편향: **${s.bias || '-'}**`);
      lines.push(`- 진입 트리거: ${s.entry || '-'}`);
      lines.push(`- 무효화(손절): ${s.stop || '-'}`);
      lines.push(`- 1차 목표: ${s.target || '-'}`);
      lines.push(`- 리스크: ${s.note || '-'}`);
      lines.push('');
    }
    if (decision.report) {
      lines.push(decision.report);
      lines.push('');
    }

    lines.push('---');
    lines.push(
      '본 리포트는 AI 시뮬레이션 결과이며 투자 조언이 아닙니다. 실제 주문은 이뤄지지 않습니다.'
    );
    lines.push('');
    return lines.join('\n');
  }
}

module.exports = { Engine };
