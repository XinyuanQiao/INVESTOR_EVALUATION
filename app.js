// English comments only (per user requirement).

(() => {
  "use strict";

  // ===== Fixed parameters (n adjusted to 6) =====
  const PARAMS = {
    n: 6,
    CAP_Q: 100,
    CAP_Y: 500,
    PotTarget: 500,
    // Score parameters
    score_a: 1.2,
    score_c: 2.0,
    mdd0: 0.05,
    k_contrib: 0.4,
    u_clip: 6.0,
    alpha: 0.05,
    k_credit: 1.0,
    Dln_min: 0.15,
    leverageMax: 2.0,
  };

  // ===== DOM =====
  const el = {
    nValue: document.getElementById("nValue"),
    potTargetValue: document.getElementById("potTargetValue"),
    capValue: document.getElementById("capValue"),
    settlementDate: document.getElementById("settlementDate"),
    tbody: document.getElementById("tbody"),
    addRowBtn: document.getElementById("addRowBtn"),
    calcBtn: document.getElementById("calcBtn"),
    errors: document.getElementById("errors"),
    potValue: document.getElementById("potValue"),
  };

  function initConstantsView() {
    el.nValue.textContent = String(PARAMS.n);
    el.potTargetValue.textContent = String(PARAMS.PotTarget);
    el.capValue.textContent = `${PARAMS.CAP_Q} / ${PARAMS.CAP_Y}`;
  }

  // ===== Utilities =====
  function isFiniteNumber(x) {
    return typeof x === "number" && Number.isFinite(x);
  }

  function toNumberOrNaN(v) {
    if (typeof v === "number") return v;
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    return Number(s);
  }

  function roundInt(x) {
    // Amounts are non-negative in this app; Math.round is fine here.
    return Math.round(x);
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function median(arr) {
    const xs = arr.slice().sort((a, b) => a - b);
    const n = xs.length;
    if (n === 0) return NaN;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  }

  function stableSoftmax(weights, k = 1.0) {
    // weights: array of real numbers; returns normalized probabilities
    const scaled = weights.map((x) => k * x);
    const m = Math.max(...scaled);
    const exps = scaled.map((x) => Math.exp(x - m));
    const sum = exps.reduce((a, b) => a + b, 0);
    if (sum <= 0 || !Number.isFinite(sum)) {
      const n = weights.length;
      return weights.map(() => 1 / n);
    }
    return exps.map((e) => e / sum);
  }

  function allocateIntegersByRemainder(totalInt, floats) {
    // Largest remainder method using floor + distribute remaining 1's.
    // Ensures sum(alloc) === totalInt and alloc[i] >= 0.
    const base = floats.map((x) => Math.floor(Math.max(0, x)));
    let used = base.reduce((a, b) => a + b, 0);
    let remain = totalInt - used;

    const frac = floats.map((x, i) => ({
      i,
      frac: Math.max(0, x) - Math.floor(Math.max(0, x)),
    }));
    frac.sort((a, b) => b.frac - a.frac);

    const out = base.slice();
    let idx = 0;
    while (remain > 0 && idx < frac.length) {
      out[frac[idx].i] += 1;
      remain -= 1;
      idx += 1;
      if (idx >= frac.length && remain > 0) idx = 0;
    }
    return out;
  }

  function parseDateInput(value) {
    const s = String(value ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getAnnualizationPower() {
    // If settlement date is provided, annualize by actual days from quarter start to settlement date.
    // Otherwise fall back to quarterly annualization (4 quarters/year).
    const d = parseDateInput(el.settlementDate?.value);
    if (!d) return 4;

    const y = d.getFullYear();
    const m = d.getMonth(); // 0-11
    const qStartMonth = Math.floor(m / 3) * 3;
    const qStart = new Date(y, qStartMonth, 1);
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.floor((d.getTime() - qStart.getTime()) / msPerDay) + 1;
    if (!Number.isFinite(days) || days <= 0) return 4;
    return 365 / days;
  }

  // ===== Core math =====
  function computeP(R, MDD, annPower) {
    const Ann = Math.pow(1 + R, annPower) - 1;
    const Calmar = Ann / (MDD + PARAMS.mdd0);
    const Calmar_adj = Math.max(-0.9, Calmar);
    const FD = Math.max(0.3, 1 - 0.9 * MDD);
    const base = Math.max(0.2, 1 + Calmar_adj);
    const P = Math.pow(base, PARAMS.score_a) * Math.pow(FD, PARAMS.score_c);
    return { Ann, Calmar, P };
  }

  // ===== Table rows =====
  function makeRow(preset = null) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button type="button" class="dangerBtn" title="删除">×</button></td>
      <td><input class="name" placeholder="A" /></td>
      <td><input class="small" placeholder="0.06" /></td>
      <td><input class="small" placeholder="0.08" /></td>
      <td><input class="small" placeholder="1.0" /></td>
      <td><input class="small" placeholder="0" /></td>
      <td class="out" data-out="Ann">-</td>
      <td class="out" data-out="Calmar">-</td>
      <td class="out" data-out="P">-</td>
      <td class="out" data-out="Contrib">-</td>
      <td class="out" data-out="Net">-</td>
      <td class="out" data-out="YTD_After">-</td>
      <td class="out" data-out="CAP_Remain_After">-</td>
      <td class="out" data-out="Flags">-</td>
    `;

    tr.querySelector(".dangerBtn").addEventListener("click", () => {
      tr.remove();
    });

    // Apply preset inputs for default examples.
    if (preset) {
      const inputs = tr.querySelectorAll("input");
      inputs[0].value = String(preset.name ?? "");
      inputs[1].value = String(preset.R ?? "");
      inputs[2].value = String(preset.MDD ?? "");
      inputs[3].value = String(preset.Leverage ?? "");
      inputs[4].value = String(preset.YTD_Contrib ?? "");
    }

    return tr;
  }

  function seedRows() {
    // Default example rows (from the original Case 1).
    const defaults = [
      { name: "A", R: 0.06, MDD: 0.06, Leverage: 1, YTD_Contrib: 0 },
      { name: "B", R: 0.03, MDD: 0.08, Leverage: 1, YTD_Contrib: 0 },
      { name: "C", R: 0.01, MDD: 0.03, Leverage: 1, YTD_Contrib: 0 },
      { name: "E", R: 0.02, MDD: 0.09, Leverage: 1, YTD_Contrib: 0 },
      { name: "D", R: -0.04, MDD: 0.12, Leverage: 1, YTD_Contrib: 0 },
    ];
    defaults.forEach((row) => el.tbody.appendChild(makeRow(row)));
  }

  function getRows() {
    const trs = Array.from(el.tbody.querySelectorAll("tr"));
    return trs.map((tr) => {
      const inputs = tr.querySelectorAll("input");
      const name = inputs[0].value.trim() || `P${Math.random().toString(16).slice(2, 6)}`;
      const R = toNumberOrNaN(inputs[1].value);
      const MDD = toNumberOrNaN(inputs[2].value);
      const Leverage = toNumberOrNaN(inputs[3].value);
      const YTD_Contrib = toNumberOrNaN(inputs[4].value);
      return { tr, name, R, MDD, Leverage, YTD_Contrib };
    });
  }

  function setOut(tr, key, value) {
    const td = tr.querySelector(`[data-out="${key}"]`);
    if (!td) return;
    td.textContent = value;
  }

  function fmt(x, digits = 3) {
    if (!isFiniteNumber(x)) return "-";
    const s = x.toFixed(digits);
    // Trim trailing zeros for readability.
    return s.replace(/\.?0+$/, "");
  }

  function validateRow(row, idx) {
    const errs = [];
    if (!row.name) errs.push(`第 ${idx + 1} 行：Name 不能为空`);
    if (!isFiniteNumber(row.R)) errs.push(`第 ${idx + 1} 行：R 不是数字`);
    if (!isFiniteNumber(row.MDD)) errs.push(`第 ${idx + 1} 行：MDD 不是数字`);
    if (!isFiniteNumber(row.Leverage)) errs.push(`第 ${idx + 1} 行：Leverage 不是数字`);
    if (!isFiniteNumber(row.YTD_Contrib)) errs.push(`第 ${idx + 1} 行：YTD_Contrib 不是数字`);

    if (isFiniteNumber(row.R) && row.R <= -1) errs.push(`第 ${idx + 1} 行：R 必须 > -1`);
    if (isFiniteNumber(row.MDD) && (row.MDD < 0 || row.MDD > 1.5))
      errs.push(`第 ${idx + 1} 行：MDD 建议在 0~1 之间（小数）`);
    if (isFiniteNumber(row.Leverage) && row.Leverage < 0)
      errs.push(`第 ${idx + 1} 行：Leverage 必须 >= 0`);
    if (isFiniteNumber(row.YTD_Contrib) && row.YTD_Contrib < 0)
      errs.push(`第 ${idx + 1} 行：YTD_Contrib 必须 >= 0`);

    return errs;
  }

  function calculate() {
    el.errors.textContent = "";

    const rows = getRows();
    if (rows.length < 2) {
      el.errors.textContent = "至少需要 2 人才能计算（需要第一名与非第一名集合）。";
      return;
    }

    const allErrs = [];
    rows.forEach((r, i) => allErrs.push(...validateRow(r, i)));
    if (allErrs.length > 0) {
      el.errors.textContent = allErrs.join("\n");
      return;
    }

    const annPower = getAnnualizationPower();

    // Step 1: compute P and lnP
    const stats = rows.map((r) => {
      const { Ann, Calmar, P } = computeP(r.R, r.MDD, annPower);
      const lnP = Math.log(P);
      const isLeverageViolation = r.Leverage > PARAMS.leverageMax;
      return { ...r, Ann, Calmar, P, lnP, isLeverageViolation };
    });

    const lnPs = stats.map((x) => x.lnP);
    const C = median(lnPs);
    const absDev = lnPs.map((x) => Math.abs(x - C));
    const MAD = median(absDev);
    const D = Math.max(1.4826 * MAD, PARAMS.Dln_min);

    const lnPmax = Math.max(...lnPs);
    // By default, treat all max lnP as leaders (tie). If everyone ties, fall back to a single leader
    // to avoid a degenerate "no contributors => Pot=0" outcome.
    let isLeaderByIdx = stats.map((s) => s.lnP === lnPmax);
    let leaderCount = isLeaderByIdx.filter(Boolean).length;
    if (leaderCount === stats.length) {
      const firstLeader = lnPs.indexOf(lnPmax);
      isLeaderByIdx = isLeaderByIdx.map((_, i) => i === firstLeader);
      leaderCount = 1;
    }

    // Step 2: Contrib (raw, then caps), with leverage override
    const capRemain = stats.map((s) => Math.max(0, PARAMS.CAP_Y - s.YTD_Contrib));

    const contribFloat = stats.map(() => 0);

    const S = stats
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !isLeaderByIdx[i])
      .map(({ i }) => i);

    if (S.length > 0) {
      const t = stats.map((s) => (lnPmax - s.lnP) / D);
      const tS = S.map((i) => t[i]);
      const tMinS = Math.min(...tS);

      const u = stats.map(() => 0);
      S.forEach((i) => {
        u[i] = Math.min(t[i] - tMinS, PARAMS.u_clip);
      });

      const uS = S.map((i) => u[i]);
      const wS = stableSoftmax(uS, PARAMS.k_contrib);
      const wPrimeS = wS.map(
        (w) => (1 - PARAMS.alpha) * w + PARAMS.alpha * (1 / S.length)
      );

      S.forEach((idx, j) => {
        const raw = PARAMS.PotTarget * wPrimeS[j];
        const capped = Math.min(raw, PARAMS.CAP_Q, capRemain[idx]);
        contribFloat[idx] = capped;
      });
    }

    // Leaders default contrib 0 (already).
    // Leverage override: fixed contrib and credit=0 later.
    stats.forEach((s, i) => {
      if (s.isLeverageViolation) {
        contribFloat[i] = Math.min(PARAMS.CAP_Q, capRemain[i]);
      }
    });

    const contribInt = contribFloat.map((x) => roundInt(x));
    const contribSumFloat = contribFloat.reduce((a, b) => a + b, 0);
    const Pot = contribInt.reduce((a, b) => a + b, 0);

    // Step 3: Credit weights in log-space; leverage violators get 0 weight.
    const z = stats.map((s) => (s.lnP - C) / D);
    let creditW = stableSoftmax(z, PARAMS.k_credit);
    creditW = creditW.map((w, i) => (stats[i].isLeverageViolation ? 0 : w));
    const wSum = creditW.reduce((a, b) => a + b, 0);
    if (wSum > 0) creditW = creditW.map((w) => w / wSum);

    const creditFloat = creditW.map((w) => Pot * w);
    const creditInt = allocateIntegersByRemainder(Pot, creditFloat);

    // Ensure violators credit is exactly 0.
    stats.forEach((s, i) => {
      if (s.isLeverageViolation) creditInt[i] = 0;
    });

    // If forcing violators to 0 breaks sum (edge), fix by re-allocating among non-violators.
    const sumCredit = creditInt.reduce((a, b) => a + b, 0);
    if (sumCredit !== Pot) {
      const eligible = stats.map((s, i) => (!s.isLeverageViolation ? i : -1)).filter((i) => i >= 0);
      const eligibleFloats = eligible.map((i) => creditFloat[i]);
      const eligibleAlloc = allocateIntegersByRemainder(Pot, eligibleFloats);
      eligible.forEach((idx, j) => {
        creditInt[idx] = eligibleAlloc[j];
      });
      stats.forEach((s, i) => {
        if (s.isLeverageViolation) creditInt[i] = 0;
      });
    }

    const netInt = creditInt.map((c, i) => c - contribInt[i]);
    const ytdAfter = stats.map((s, i) => s.YTD_Contrib - netInt[i]);
    const capRemainAfter = ytdAfter.map((y) => Math.max(0, PARAMS.CAP_Y - y));

    // Step 4: Render
    stats.forEach((s, i) => {
      setOut(s.tr, "Ann", fmt(s.Ann, 3));
      setOut(s.tr, "Calmar", fmt(s.Calmar, 3));
      setOut(s.tr, "P", fmt(s.P, 3));
      setOut(s.tr, "Contrib", String(contribInt[i]));
      setOut(s.tr, "Net", String(netInt[i]));
      setOut(s.tr, "YTD_After", String(ytdAfter[i]));
      setOut(s.tr, "CAP_Remain_After", String(capRemainAfter[i]));

      const flags = [];
      if (isLeaderByIdx[i]) flags.push(`Leader${leaderCount > 1 ? "(tie)" : ""}`);
      if (s.isLeverageViolation) flags.push("Leverage>2 (Credit=0)");
      setOut(s.tr, "Flags", flags.length ? flags.join(", ") : "-");
    });

    el.potValue.textContent = String(Pot);
  }

  // ===== Boot =====
  initConstantsView();
  seedRows();

  el.addRowBtn.addEventListener("click", () => {
    el.tbody.appendChild(makeRow());
  });
  el.calcBtn.addEventListener("click", calculate);
})();

