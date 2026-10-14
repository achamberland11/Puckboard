// Sustainability ("luck check") derivations for the player-card Advanced section.
// Display-only: never feeds Z-scores, GVI/RVI or Tiers.
// No minimum GP: values always render; GP < SMALL_SAMPLE_GP only fades the
// verdict (hollow dot + SS tag) and shrinks percentage verdicts toward the
// benchmark. Benchmarks span every season available on the site.

export const SMALL_SAMPLE_GP = 10;

const LEAGUE = {
  shForward: 0.11,
  shDefence: 0.065,
  oish: 0.087,
  pdo: 1000,
  ipp: 0.68,
  sv: 0.91,
  sv5v5: 0.915,
  hdsv: 0.805,
};

const T = {
  shDelta: 0.025,
  shNeutral: 0.015,
  ixgGap: 2,
  ippHigh: 0.78,
  ippLow: 0.58,
  oishHigh: 0.11,
  oishLow: 0.075,
  pdoHigh: 1030,
  pdoLow: 975,
  ppWeak: 60,
  ppStrong: 150,
  ppHot: 7,
  toiDrop: 90,
  svBand: 0.01,
  gsax: 3,
  hdHot: 0.835,
  hdCold: 0.775,
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseTOI(s) {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const m = String(s).match(/(\d+):(\d+)/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtTOI(sec) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtPct(v, digits = 1) {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function fmtSigned(v, digits = 1) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;
}

export function arrowChar(dir) {
  return dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
}

function blend(delta, gp) {
  return delta * Math.min(1, (num(gp) || 0) / SMALL_SAMPLE_GP);
}

function smallSample(gp) {
  return (num(gp) || 0) < SMALL_SAMPLE_GP;
}

function dirOf(delta, band = 0) {
  if (delta == null) return "flat";
  return delta > band ? "up" : delta < -band ? "down" : "flat";
}

// Career benchmarks across every season available on the site.
export function careerSkaterShot(seasonData, seasons, playerId, isDefence) {
  let g = 0;
  let s = 0;
  let toiSum = 0;
  let toiN = 0;
  for (const season of seasons || []) {
    const p = seasonData?.[season]?.find((r) => r.ID === playerId);
    if (!p) continue;
    g += num(p.G) || 0;
    s += num(p.S) || 0;
    const t = parseTOI(p.TOI);
    if (t != null) {
      toiSum += t;
      toiN++;
    }
  }
  return {
    shPct: s > 0 ? g / s : null,
    posFallback: isDefence ? LEAGUE.shDefence : LEAGUE.shForward,
    toiAvg: toiN > 0 ? toiSum / toiN : null,
  };
}

// Career involvement / on-ice luck across every season on the site.
// advMaps / mpMaps are parallel arrays aligned with `seasons`
// (NHL report Maps and MoneyPuck index objects, as returned by the loaders).
// IPP pools points over on-ice goals; OISH%/PDO are GP-weighted means.
export function careerSkaterRates(advMaps, mpMaps, seasons, playerId) {
  let ptsSum = 0;
  let oigSum = 0;
  let oishSum = 0;
  let oishGP = 0;
  let pdoSum = 0;
  let pdoGP = 0;
  for (let i = 0; i < (seasons || []).length; i++) {
    const adv = advMaps?.[i]?.get?.(playerId) || {};
    const mpEntry = mpMaps?.[i]?.[playerId];
    const sit = mpEntry?.ev || mpEntry?.all || null;
    if (sit?.pts != null && sit?.onIceG != null) {
      ptsSum += sit.pts;
      oigSum += sit.onIceG;
    }
    const oish = num(adv.scoring?.onIceShootingPct5v5);
    if (oish != null) {
      const w = num(adv.scoring?.gamesPlayed) || 0;
      oishSum += oish * w;
      oishGP += w;
    }
    const pdo = num(adv.pct?.skaterShootingPlusSavePct5v5);
    if (pdo != null) {
      const w = num(adv.pct?.gamesPlayed) || num(adv.scoring?.gamesPlayed) || 0;
      pdoSum += pdo * 1000 * w;
      pdoGP += w;
    }
  }
  return {
    ipp: oigSum >= 5 ? ptsSum / oigSum : null,
    oish: oishGP > 0 ? oishSum / oishGP : null,
    pdo: pdoGP > 0 ? pdoSum / pdoGP : null,
  };
}

export function careerGoalieSave(seasonData, seasons, playerId) {  let saSum = 0;
  let svSum = 0;
  for (const season of seasons || []) {
    const p = seasonData?.[season]?.find((r) => r.ID === playerId);
    if (!p) continue;
    const sa = num(p.SA) || 0;
    const sv = num(p["SV%"]);
    if (sa > 0 && sv != null) {
      saSum += sa;
      svSum += sa * sv;
    }
  }
  return { svPct: saSum > 0 ? svSum / saSum : null, sa: saSum };
}

function rowShell(key, label, extra = {}) {
  return {
    key,
    label,
    now: "—",
    ref: "—",
    tone: "neutral",
    dir: "flat",
    small: false,
    note: "",
    ...extra,
  };
}

export function skaterLuckRows({ row, adv = {}, mp, career, isDefence }) {
  const gp = num(row.GP) || 0;
  const small = smallSample(gp);
  const rows = [];
  const scoring = adv.scoring || {};
  const pct = adv.pct || {};
  const pp = adv.pp || {};
  const sit = mp?.ev || mp?.all || null;
  const mpGap =
    sit?.g != null && sit?.xg != null ? sit.g - sit.xg : null;

  // 1. SH% season vs career
  {
    const r = rowShell("sh", "SH%", { small });
    const s = num(row.S) || 0;
    const now = s > 0 ? (num(row.G) || 0) / s : null;
    const car = career?.shPct ?? null;
    const lavg = career?.posFallback ?? null;
    r.now = `${fmtPct(now)} · ${gp} GP`;
    r.ref =
      car != null && lavg != null
        ? `c-avg ${fmtPct(car)} · l-avg ${fmtPct(lavg)}`
        : `l-avg ${fmtPct(lavg)}`;
    if (now != null && (car != null || lavg != null)) {
      const ref = car ?? lavg;
      const delta = now - ref;
      const eff = blend(delta, gp);
      r.dir = dirOf(delta, 0.005);
      r.note = `${fmtSigned(delta * 100, 1)}pp vs ${car != null ? "career" : "pos. avg"}`;
      if (Math.abs(eff) < T.shNeutral) {
        r.tone = "neutral";
        r.note = "in line with career";
      } else if (eff >= T.shDelta) {
        if (mpGap != null && mpGap > 1) {
          r.tone = "bad";
          r.note = "spike — finishing above chances, G fades";
        } else if (mpGap != null) {
          r.tone = "neutral";
          r.note = "hot but chances support it — see G vs ixG";
        } else {
          r.tone = "neutral";
          r.note = "elevated — xG unavailable";
        }
      } else if (eff <= -T.shDelta) {
        r.tone = mpGap != null && mpGap < 0 ? "good" : "neutral";
        r.note =
          mpGap != null && mpGap < 0
            ? "buy-low — chances intact, G coming"
            : "cold — low event, not bad luck";
      } else {
        r.tone = "neutral";
      }
    } else {
      r.note = "no shot sample yet";
    }
    rows.push(r);
  }

  // 2. Goals vs individual expected goals
  {
    const r = rowShell("ixg", "G vs ixG", { small });
    if (sit?.g != null && sit?.xg != null) {
      const gap = sit.g - sit.xg;
      r.now = `${sit.g} G vs ${sit.xg.toFixed(1)} ixG (${fmtSigned(gap, 1)})`;
      r.ref = sit === mp?.ev ? "5v5" : "all sits";
      r.dir = dirOf(gap, 0.5);
      if (gap >= T.ixgGap) {
        r.tone = "bad";
        r.note = "over-finishing — sell-high on G";
      } else if (gap <= -T.ixgGap) {
        r.tone = "good";
        r.note = "under-finishing — buy-low on G";
      } else {
        r.tone = "neutral";
        r.note = "in line with chances";
      }
    } else {
      r.note = "xG unavailable";
    }
    rows.push(r);
  }

  // 3. Primary vs secondary assists (5v5)
  {
    const r = rowShell("a1a2", "A1 vs A2", { small });
    const a1 = num(scoring.primaryAssists5v5);
    const a2 = num(scoring.secondaryAssists5v5);
    if (a1 != null && a2 != null && a1 + a2 > 0) {
      const share1 = a1 / (a1 + a2);
      r.now = `${a1}–${a2} (${fmtPct(share1, 0)} primary)`;
      r.ref = "5v5";
      r.dir = share1 >= 0.6 ? "up" : share1 <= 0.45 ? "down" : "flat";
      if (a1 + a2 >= 5 && 1 - share1 > 0.55) {
        r.tone = "bad";
        r.note = "secondary-heavy — A fades";
      } else if (a1 + a2 >= 5 && share1 >= 0.65) {
        r.tone = "good";
        r.note = "primary-driven — A holds";
      } else {
        r.tone = "neutral";
        r.note = a1 + a2 < 5 ? "few assists yet" : "balanced mix";
      }
    } else {
      r.note = "assist split unavailable";
    }
    rows.push(r);
  }

  // 4. IPP with TOI context
  {
    const r = rowShell("ipp", "IPP · TOI", { small });
    const toi =
      num(pct.timeOnIcePerGame5v5) ?? parseTOI(row.TOI) ?? null;
    const toiTxt = toi != null ? `${fmtTOI(toi)}/g` : "";
    if (sit?.pts != null && sit?.onIceG != null && sit.onIceG >= 1) {
      const ipp = sit.pts / sit.onIceG;
      const cIpp = career?.ipp ?? null;
      r.now = `${fmtPct(ipp, 0)} ${toiTxt ? `· ${toiTxt}` : ""}`.trim();
      const bench = [`l-avg ${fmtPct(LEAGUE.ipp, 0)}`];
      if (cIpp != null) bench.unshift(`c-avg ${fmtPct(cIpp, 0)}`);
      if (career?.toiAvg != null) bench.push(`c-avg TOI ${fmtTOI(career.toiAvg)}/g`);
      r.ref = bench.join(" · ");
      const toiDrop =
        toi != null && career?.toiAvg != null ? toi - career.toiAvg : null;
      if (toiDrop != null && toiDrop <= -T.toiDrop) {
        r.tone = "bad";
        r.dir = "down";
        r.note = `TOI down ${fmtTOI(-toiDrop)} — role loss hurts P/PPP`;
      } else if (sit.onIceG < 5) {
        r.tone = "neutral";
        r.dir = dirOf(ipp - (cIpp ?? LEAGUE.ipp), 0.05);
        r.note = "few on-ice goals yet";
      } else if (cIpp != null) {
        const d = ipp - cIpp;
        r.dir = dirOf(d, 0.05);
        if (d >= 0.1) {
          r.tone = "bad";
          r.note = "involvement spike vs career — P dips ahead";
        } else if (d <= -0.1) {
          r.tone = "good";
          r.note = "involvement dip vs career — points coming";
        } else {
          r.tone = "neutral";
          r.note = "involvement in line with career";
        }
      } else if (ipp >= T.ippHigh) {
        r.tone = "bad";
        r.dir = "up";
        r.note = "involvement spike — P dips ahead";
      } else if (ipp <= T.ippLow) {
        r.tone = "good";
        r.dir = "down";
        r.note = "involvement dip — points coming";
      } else {
        r.tone = "neutral";
        r.dir = dirOf(ipp - LEAGUE.ipp, 0.05);
        r.note = "normal involvement";
      }
    } else {
      r.now = toiTxt || "—";
      r.ref = `l-avg ${fmtPct(LEAGUE.ipp, 0)}`;
      r.note = "on-ice data unavailable";
    }
    rows.push(r);
  }

  // 5. On-ice shooting %
  {
    const r = rowShell("oish", "OISH%", { small });
    const v = num(scoring.onIceShootingPct5v5);
    const cAvg = career?.oish ?? null;
    const base = cAvg ?? LEAGUE.oish;
    r.now = v != null ? `${fmtPct(v)} · ${gp} GP` : "—";
    r.ref =
      cAvg != null
        ? `c-avg ${fmtPct(cAvg)} · l-avg ${fmtPct(LEAGUE.oish)}`
        : `l-avg ${fmtPct(LEAGUE.oish)}`;
    if (v != null) {
      const eff = blend(v - base, gp);
      r.dir = dirOf(v - base, 0.005);
      const vsTxt = cAvg != null ? "career" : "l-avg";
      if (eff >= T.oishHigh - LEAGUE.oish) {
        r.tone = "bad";
        r.note = `linemate heater vs ${vsTxt} — P/+/- fade`;
      } else if (eff <= T.oishLow - LEAGUE.oish) {
        r.tone = "good";
        r.note = `linemates cold vs ${vsTxt} — P/+/- coming`;
      } else {
        r.tone = "neutral";
        r.note = "normal linemate finishing";
      }
    } else {
      r.note = "unavailable";
    }
    rows.push(r);
  }

  // 6. PDO (5v5)
  {
    const r = rowShell("pdo", "PDO", { small });
    const v = num(pct.skaterShootingPlusSavePct5v5);
    const pdo = v != null ? v * 1000 : null;
    const cAvg = career?.pdo ?? null;
    const base = cAvg ?? LEAGUE.pdo;
    r.now = pdo != null ? `${pdo.toFixed(0)} · ${gp} GP` : "—";
    r.ref =
      cAvg != null
        ? `c-avg ${cAvg.toFixed(0)} · l-avg ${LEAGUE.pdo}`
        : `l-avg ${LEAGUE.pdo}`;
    if (pdo != null) {
      const eff = blend(pdo - base, gp);
      r.dir = dirOf(pdo - base, 5);
      const vsTxt = cAvg != null ? "career" : "l-avg";
      if (eff >= T.pdoHigh - LEAGUE.pdo) {
        r.tone = "bad";
        r.note = `total on-ice luck vs ${vsTxt} — +/- fades`;
      } else if (eff <= T.pdoLow - LEAGUE.pdo) {
        r.tone = "good";
        r.note = `total on-ice drought vs ${vsTxt} — +/- coming`;
      } else {
        r.tone = "neutral";
        r.note = "PDO = OISH% + on-ice SV%";
      }
    } else {
      r.note = "PDO = OISH% + on-ice SV%";
    }
    rows.push(r);
  }

  // 7. Power-play role vs rate
  {
    const r = rowShell("pp", "PP TOI · PPP/60", { small });
    const toi = num(pp.ppTimeOnIcePerGame);
    const rate = num(pp.ppPointsPer60);
    r.now =
      toi != null || rate != null
        ? `${toi != null ? fmtTOI(toi) + "/g" : "—"} · ${rate != null ? rate.toFixed(1) + "/60" : "—"}`
        : "—";
    r.ref = "role vs rate";
    const ppp = num(row.PPP) || 0;
    if (toi != null && rate != null) {
      if (toi < T.ppWeak && ppp >= 5) {
        r.tone = "bad";
        r.dir = "down";
        r.note = "PPP without role — fades";
      } else if (toi >= T.ppStrong && rate < 4) {
        r.tone = "good";
        r.dir = "up";
        r.note = "role, no production — buy-low";
      } else if (rate >= T.ppHot) {
        r.tone = "bad";
        r.dir = "up";
        r.note = "unsustainable PP rate";
      } else {
        r.tone = "neutral";
        r.dir = "flat";
        r.note = "role matches production";
      }
    } else {
      r.note = "PP data unavailable";
    }
    rows.push(r);
  }

  return rows;
}

export function goalieLuckRows({ row, mp, edge, career }) {
  const gp = num(row.GP) || 0;
  const small = smallSample(gp);
  const rows = [];
  const sit = mp?.ev || mp?.all || null;
  const gsax =
    sit?.xGoals != null && sit?.goals != null ? sit.xGoals - sit.goals : null;
  const gsaxStrong = gsax != null && gsax >= T.gsax;
  const gsaxWeak = gsax != null && gsax <= -T.gsax;

  // 1. 5v5 save %
  {
    const r = rowShell("sv5", "5v5 SV%", { small });
    const v = sit?.savePct ?? null;
    const ref = career?.svPct ?? LEAGUE.sv5v5;
    if (v != null) {
      r.now = `${fmtPct(v)} · ${gp} GP`;
      r.ref =
        career?.svPct != null
          ? `c-avg ${fmtPct(career.svPct)} · l-avg ${fmtPct(LEAGUE.sv5v5)}`
          : `l-avg ${fmtPct(LEAGUE.sv5v5)}`;
      const d = v - ref;
      r.dir = dirOf(d, 0.003);
      if (d >= T.svBand && !gsaxStrong) {
        r.tone = "bad";
        r.note = "stopping pucks, not chances — sell-high";
      } else if (d >= T.svBand && gsaxStrong) {
        r.tone = "good";
        r.note = "genuinely elite — hold";
      } else if (d <= -T.svBand && gsax != null && gsax > 0) {
        r.tone = "good";
        r.note = "buy-low — chances say better";
      } else if (d <= -T.svBand) {
        r.tone = "bad";
        r.note = "below career and chances";
      } else {
        r.tone = "neutral";
        r.note = "W follows team — judge on chances";
      }
    } else {
      const all = num(row["SV%"]);
      r.now = all != null ? `${fmtPct(all)} (all sits)` : "—";
      r.ref =
        career?.svPct != null
          ? `c-avg ${fmtPct(career.svPct)} · l-avg ${fmtPct(LEAGUE.sv5v5)}`
          : `l-avg ${fmtPct(LEAGUE.sv5v5)}`;
      r.note = "5v5 split unavailable";
    }
    rows.push(r);
  }

  // 2. High-danger save %
  {
    const r = rowShell("hdsv", "HD SV%", { small });
    const summary = edge?.shotLocationSummary || [];
    const high = summary.find((s) => s.locationCode === "high");
    const v = high != null ? num(high.savePctg) : null;
    if (v != null) {
      const pctile = num(high.savePctgPercentile);
      r.now = `${fmtPct(v)}${pctile != null ? ` (p${Math.round(pctile * 100)})` : ""}`;
      r.ref = `l-avg ${fmtPct(LEAGUE.hdsv)}`;
      r.dir = dirOf(v - LEAGUE.hdsv, 0.01);
      if (v >= T.hdHot) {
        r.tone = gsaxStrong ? "good" : "bad";
        r.note = gsaxStrong ? "stealing chances — hold" : "HD heater — GAA/SV% fade";
      } else if (v <= T.hdCold) {
        r.tone = "good";
        r.note = "HD dip — buy-low";
      } else {
        r.tone = "neutral";
        r.note = "normal HD workload";
      }
    } else {
      r.note = "Edge data unavailable";
    }
    rows.push(r);
  }

  // 3. Goals saved above expected
  {
    const r = rowShell("gsax", "GSAx", { small });
    if (gsax != null) {
      r.now = `${fmtSigned(gsax, 1)}${sit === mp?.ev ? " (5v5)" : " (all)"}`;
      r.ref = "l-avg 0";
      r.dir = dirOf(gsax, 1);
      if (gsax >= T.gsax) {
        r.tone = "good";
        r.note = "skill signal — GAA/SV% hold";
      } else if (gsax <= -T.gsax) {
        r.tone = "bad";
        r.note = "leaking chances — avoid";
      } else {
        r.tone = "neutral";
        r.note = "around expected";
      }
    } else {
      r.note = "xG model unavailable";
    }
    rows.push(r);
  }

  return rows;
}
