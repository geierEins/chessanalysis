// The "Gegner und Länder" tab: head-to-head with one opponent, countries, most frequent opponents, stronger and weaker ones.

import { countryName } from '../../ui/playerLabel.js';
import { esc, wdl, score, avg, pc, f0, f1, groupBy, byCountDesc, fold, fmtDate, RES_LETTER, hasRealRating, finalTip } from './format.js';
import { card, EMPTY, flag, wdlBar, hbars, bigStats, sortHead, sortRows } from './cards.js';
import { gamesCount } from './gameLists.js';

const COUNTRY_LIMITS = [10, 25, 50, 0];

/** Segmented "Top 10 · 25 · 50 · Alle" switch for the country cards - metaController handles data-country-limit. */
function limitPicker(current) {
  const btns = COUNTRY_LIMITS.map((n) => {
    const on = n === current;
    return `<button type="button" class="${on ? 'on' : ''}" data-country-limit="${n}" aria-pressed="${on}" title="${n ? `Top ${n} Länder zeigen` : 'Alle Länder zeigen'}">${n || 'Alle'}</button>`;
  });
  return `<span class="meta-seg" role="group" aria-label="Anzahl Länder"><span class="meta-seg-l">Top</span>${btns.join('')}</span>`;
}

export function opponents(rs, ctx) {
  if (!rs.length) return card('Gegner', EMPTY, { cls: 'w12' });
  let h2h = '';
  if (ctx.opponent) {
    const c = wdl(rs);
    const chrono = [...rs].sort((a, b) => a.endTime - b.endTime);
    const withEngine = rs.filter((r) => ctx.engineOf(r));
    const fam = [...groupBy(rs.filter((r) => r.family), (r) => r.family)].sort(byCountDesc)[0]?.[0];
    const oppName = rs[0].opponent;
    h2h = card(`Direktvergleich mit ${esc(oppName)}`, `
      <div class="meta-h2h">
        <div><div class="name">${esc(ctx.username)}</div><div class="meta-muted small">Ø Gen. ${f1(avg(withEngine, (r) => ctx.engineOf(r).accuracy))}</div></div>
        <div class="rec">${c.W} – ${c.D} – ${c.L}</div>
        <div><div class="name">${flag(ctx.countryOf(oppName))} ${esc(oppName)}</div><div class="meta-muted small">Ø Gen. ${f1(avg(withEngine, (r) => ctx.engineOf(r).oppAccuracy))}</div></div>
      </div>
      ${wdlBar(rs)}
      <div class="meta-lastres" aria-label="Letzte Ergebnisse">${chrono.slice(-20).map((r) => `<span class="meta-res ${r.result}"${finalTip(r)} data-tip="${fmtDate(r.endTime)} · ${esc(r.family ?? '')}">${RES_LETTER[r.result]}</span>`).join('')}</div>
      ${bigStats([[rs.length, 'Partien'], [pc(score(rs)), 'Punkte-Quote'], [esc(fam ?? '–'), 'häufigste Eröffnung'], [f0(avg(rs, (r) => r.moves)), 'Ø Züge']])}`,
      { cls: 'w12', note: 'Alle Tabs zeigen jetzt nur Partien gegen diesen Gegner.' });
  }

  const pending = ctx.countriesPending;
  const countryOf = (r) => ctx.countryOf(r.opponent) ?? null;
  const known = rs.filter((r) => countryOf(r));
  const countries = [...groupBy(known, countryOf)].sort(byCountDesc);
  const countryLabel = (code) => `<span class="meta-country">${flag(code)}${esc(countryName(code))}</span>`;
  // Both country cards show the top ctx.countryLimit countries by game count
  // (0 = all) - the table then sorts just those.
  const topCountries = ctx.countryLimit ? countries.slice(0, ctx.countryLimit) : countries;
  // "Woher kommen deine Gegner?" can be narrowed by a search text (metaController's
  // countrySearch) - over all countries, not just the top ones; case and accents don't matter.
  const query = fold((ctx.countrySearch ?? '').trim());
  const shownCountries = query ? countries.filter(([code]) => fold(countryName(code)).includes(query) || code.toLowerCase() === query) : topCountries;
  const countryRows = shownCountries.map(([code, l]) => ({ label: countryName(code), labelHtml: countryLabel(code), v: l.length, valHtml: gamesCount(l), tip: `${countryName(code)}: ${l.length} Partien` }));
  const countrySearch = `<input type="search" class="meta-country-search" data-country-search value="${esc(ctx.countrySearch ?? '')}" placeholder="Land suchen …" aria-label="Land suchen" autocomplete="off">`;
  const countryBars = query && !countryRows.length
    ? `<p class="meta-muted">Kein Land passt zu „${esc(ctx.countrySearch.trim())}“.</p>`
    : hbars(countryRows, { max: Math.max(1, ...countries.map(([, l]) => l.length)) });
  const limitNote = countries.length > topCountries.length ? `Top ${topCountries.length} von ${countries.length} Ländern nach Anzahl Partien.` : `Alle ${countries.length} Länder.`;
  const pendingNote = pending ? `Länder werden noch geladen (${ctx.countriesDone} von ${ctx.countriesTotal} Gegnern).` : 'Land aus dem Chess.com-Profil des Gegners.';
  const cSort = ctx.sorts.countries;
  const countryTable = `<div class="meta-tbl"><table><thead><tr><th>Land</th>${sortHead('countries', cSort, 'games', 'Partien', 'r')}<th class="wide">Ergebnis</th>${sortHead('countries', cSort, 'score', 'Quote', 'r')}</tr></thead><tbody>
    ${sortRows(
      topCountries.map(([code, l]) => ({ code, l, v: cSort.key === 'games' ? l.length : score(l) })),
      cSort.dir
    )
      .map((x) => `<tr><td>${countryLabel(x.code)}</td><td class="r">${gamesCount(x.l)}</td><td>${wdlBar(x.l)}</td><td class="r">${pc(score(x.l))}</td></tr>`)
      .join('')}
    </tbody></table></div>`;

  const opps = [...groupBy(rs, (r) => r.opponent.toLowerCase())].sort(byCountDesc).slice(0, 10);
  const oppTable = `<div class="meta-tbl"><table><thead><tr><th>Gegner</th><th class="r">Partien</th><th class="wide">Ergebnis</th><th class="r">Quote</th></tr></thead><tbody>
    ${opps
      .map(([, l]) => {
        const name = l[0].opponent;
        return `<tr class="click" data-opp="${esc(name)}" title="Nur Partien gegen ${esc(name)} zeigen"><td>${flag(ctx.countryOf(name))} ${esc(name)}</td><td class="r">${l.length}</td><td>${wdlBar(l)}</td><td class="r">${pc(score(l))}</td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;

  const buckets = [['≥ 150 schwächer', -Infinity, -150], ['50–150 schwächer', -150, -50], ['etwa gleich (±50)', -50, 50], ['50–150 stärker', 50, 150], ['≥ 150 stärker', 150, Infinity]];
  const rated = rs.filter((r) => hasRealRating(r) && r.oppRating != null);
  const diffRows = buckets
    .map(([label, a, b]) => {
      const l = rated.filter((r) => r.oppRating - r.ownRating >= a && r.oppRating - r.ownRating < b);
      const exp = avg(l, (r) => 1 / (1 + 10 ** ((r.oppRating - r.ownRating) / 400)));
      const act = score(l);
      return `<div class="meta-pair"><div class="meta-card-head small"><span>Gegner ${label}</span><span class="meta-muted">${l.length} P.</span></div>
        <div class="meta-hrow narrow"><span class="meta-muted">erwartet</span><div class="meta-hbar"><i style="width:${(exp ?? 0) * 100}%;background:var(--meta-draw)" data-tip="Erwartet laut Elo-Formel: ${pc(exp)}"></i></div><span class="meta-val">${pc(exp)}</span></div>
        <div class="meta-hrow narrow"><span class="meta-muted">erreicht</span><div class="meta-hbar"><i style="width:${(act ?? 0) * 100}%;background:var(--meta-s1)" data-tip="Tatsächlich: ${pc(act)}"></i></div><span class="meta-val">${pc(act)}</span></div></div>`;
    })
    .join('');

  return `<div class="meta-grid">${h2h}
    ${card('Woher kommen deine Gegner?', countries.length ? `${countrySearch}${countryBars}` : `<p class="meta-muted">${pending ? 'Länder werden geladen …' : 'Keine Länderangaben.'}</p>`, { note: `${countries.length ? `${query ? `${shownCountries.length} von ${countries.length} Ländern passen zur Suche.` : limitNote} ` : ''}${pendingNote}`, head: limitPicker(ctx.countryLimit) })}
    ${card('Quote nach Land', countries.length ? countryTable : '<p class="meta-muted">Noch keine Daten.</p>', { note: countries.length ? limitNote : '', head: limitPicker(ctx.countryLimit) })}
    ${card('Häufigste Gegner', oppTable, { note: 'Zeile anklicken: Statistik nur gegen diesen Gegner.' })}
    ${card('Gegen Stärkere und Schwächere', `<div class="meta-rows">${diffRows}</div>`, { note: 'Erwartete Quote nach Elo-Formel aus dem Wertungsunterschied, verglichen mit dem tatsächlichen Ergebnis. Nur gewertete Partien.' })}
  </div>`;
}
