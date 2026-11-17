// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, a per-protocol detail drawer with the model's own inputs and
// the protocol's farm plan, and the live-token comparables. No network: every byte it shows is in
// data.js. The page re-derives each row's implied value and farm plan from the snapshot figures
// and checks them against the board, so the page's code and the board's data are visibly the same
// arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) {
    var rc = document.getElementById('rowcount');
    if (rc) rc.textContent = 'The board data did not load.';
    var wrap = document.querySelector('.tablewrap');
    if (wrap) {
      var err = document.createElement('div');
      err.className = 'errorbox';
      err.innerHTML = '<b>The board data did not load.</b> This page reads its data from data.js beside it; without that file there is no board to show. Check the file is in place and reload.';
      wrap.parentNode.insertBefore(err, wrap);
    }
    return;
  }
  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', watchonly: false, sort: 'implied', tab: 'pre-token', selected: null };
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model in one function: the page recomputes a row from the snapshot figures and the multiple
  // the board states, and checks the number board.json carries. Multiple itself comes from the
  // comparables table, which main.ts builds from the snapshot's live-token protocols.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), model.breadth_max_chains);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * breadth)),
      growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth, age: age,
    };
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  // The page re-derives it and shows a check when it matches the board's own steps exactly.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $4 of gas per transaction';
    if (chain === 'Solana') return 'under $0.05 of network fees per transaction';
    if (chain === 'Tron') return 'about $1 of energy fees per transaction';
    if (chain === 'Bitcoin') return 'about $2 of network fees per transaction';
    return 'about $0.30 of gas per transaction on this low-fee chain';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + ' of ' + name + "'s app on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var action = actionFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: gas, time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and treat the $' + capital + ' as at-risk capital: no token is promised.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  }

  // A board step carries its cost and time after the action: split them back out for the chips.
  function splitStep(s) {
    var ci = s.lastIndexOf(' Cost: ');
    var ti = s.lastIndexOf(' Time: ');
    if (ci < 0 || ti < 0 || ti < ci) return { text: s, cost: '', time: '' };
    return { text: s.slice(0, ci), cost: s.slice(ci + 7, ti).replace(/\.$/, ''), time: s.slice(ti + 7).replace(/\.$/, '') };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- Header stats ----
  (function stats() {
    var box = document.getElementById('stats');
    box.innerHTML = '';
    document.getElementById('asof').textContent = 'Snapshot ' + DATA.as_of + ', DefiLlama protocol index';
    var defs = [
      { n: DATA.watchlist_size + ' / ' + DATA.watchlist_size, label: 'Watchlist covered', sub: 'every pre-token protocol at $50M+ TVL' },
      { n: String(DATA.board_size), label: 'Protocols ranked', sub: DATA.early_size + ' early finds below the floor' },
      { n: DATA.multiples.global_median.toFixed(2) + '×', label: 'Market median mcap / TVL', sub: 'across all live-token comparables' },
      { n: String(DATA.live_size), label: 'Live tokens set aside', sub: 'already trading, shown as comparables' },
    ];
    defs.forEach(function (d) {
      box.appendChild(el('div', { class: 'stat' }, el('b', { text: d.n }), el('span', { text: d.label }), el('em', { text: d.sub })));
    });
  })();

  // ---- Comparables table: the categories with the most live names first ----
  (function comps() {
    var rows = DATA.multiples.by_category.slice().sort(function (a, b) { return b.comps - a.comps || (a.category < b.category ? -1 : 1); });
    var body = document.querySelector('#compstable tbody');
    rows.slice(0, 12).forEach(function (c) {
      body.appendChild(el('tr', {},
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: c.median_ratio === null ? 'n/a' : c.median_ratio.toFixed(2) + '×' }),
        el('td', { class: 'num', text: c.multiple.toFixed(2) + '×' })));
    });
    var priced = rows.filter(function (c) { return c.comps >= 3; }).length;
    document.getElementById('compnote').textContent =
      rows.length + ' categories priced, ' + priced + ' with 3 or more live names. ' +
      'Categories with fewer take the market median of ' + DATA.multiples.global_median.toFixed(2) + '×. ' +
      'Full table: every category, in the data behind this page.';
  })();

  // ---- Filter controls ----
  var catSel = document.getElementById('cat');
  var chainSel = document.getElementById('chain');
  (function fillFilters() {
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = true; });
    Object.keys(cats).sort().forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chains = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (ch) { chains[ch] = (chains[ch] || 0) + 1; }); });
    Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; }).slice(0, 25).forEach(function (ch) {
      chainSel.appendChild(el('option', { value: ch, text: ch + ' (' + chains[ch] + ')' }));
    });
  })();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchonly && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      implied: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || a.rank - b.rank; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0) || a.rank - b.rank; },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank; },
      multiple: function (a, b) { return b.multiple - a.multiple || a.rank - b.rank; },
    };
    return rows.sort(by[state.sort] || by.implied);
  }

  // ---- Board ----
  var boardBody = document.querySelector('#board tbody');
  var liveBody = document.querySelector('#liveboard tbody');
  function renderBoard() {
    boardBody.innerHTML = '';
    var rows = filteredRows();
    var parts = [rows.length + ' of ' + DATA.rows.length + ' pre-token protocols shown'];
    if (state.watchonly) parts.push('watchlist only');
    parts.push(state.sort !== 'implied' ? 'sorted by ' + state.sort : 'ranked by implied value');
    document.getElementById('rowcount').textContent = parts.join(', ') + '.';
    if (rows.length === 0) {
      boardBody.appendChild(el('tr', {}, el('td', { colspan: '8', class: 'empty', text: 'Nothing matches these filters. Loosen the search or clear a filter.' })));
      return;
    }
    rows.forEach(function (r) {
      var pct = r.change_7d;
      var tr = el('tr', { 'data-slug': r.slug, tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } });
      if (state.selected === r.slug) tr.className = 'sel';
      var sub = (r.category || 'Uncategorised') + ' on ' + (r.chains.slice(0, 2).join(', ') || 'unknown') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
      var nameCell = el('td', {},
        el('div', { class: 'pname' }, document.createTextNode(r.name), WATCH[r.slug] ? el('span', { class: 'wl', text: 'Watchlist' }) : null),
        el('div', { class: 'psub', text: sub }));
      var bar = el('span', { class: 'valbar' }, el('i', { style: 'width:' + Math.max(2, Math.round(100 * r.implied_value_usd / maxImplied)) + '%' }));
      tr.appendChild(el('td', { class: 'num rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + (pct === null ? '' : pct >= 0 ? 'up' : 'down'), text: fmtPct(pct) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num mult', text: r.multiple.toFixed(2) + '×' }));
      tr.appendChild(el('td', { class: 'num' }, el('span', { class: 'valcell' }, bar, el('span', { class: 'valnum', text: fmtUsd(r.implied_value_usd) }))));
      tr.appendChild(el('td', {}, el('span', { class: 'tok', text: 'no token' })));
      boardBody.appendChild(tr);
    });
  }

  function renderLive() {
    liveBody.innerHTML = '';
    DATA.live.forEach(function (p, i) {
      liveBody.appendChild(el('tr', {},
        el('td', { class: 'num rank', text: String(i + 1) }),
        el('td', {},
          el('div', { class: 'pname', text: p.name }),
          el('div', { class: 'psub', text: (p.category || 'Uncategorised') + ' on ' + (p.chains.slice(0, 2).join(', ') || 'unknown') })),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num mult', text: p.mcap_tvl_ratio === null ? 'n/a' : p.mcap_tvl_ratio.toFixed(2) + '×' }),
        el('td', { class: 'num ' + (p.change_7d === null ? '' : p.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(p.change_7d) }),
        el('td', {}, el('span', { class: 'role', text: 'already trading, sets the multiple' }))));
    });
  }

  // ---- Detail drawer ----
  var drawer = document.getElementById('drawer');
  var card = document.getElementById('drawercard');
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    lastRow = slug;
    renderBoard();
    var v = impliedOf(row, DATA.model);
    var derived = farmSteps(row);
    var stepsAgree = derived.length === row.farm_steps.length && derived.every(function (s, i) { return s === row.farm_steps[i]; });
    var valueAgree = v.implied === row.implied_value_usd;
    card.innerHTML = '';
    card.appendChild(el('button', { class: 'close', 'aria-label': 'Close detail', onclick: closeDetail, text: '×' }));
    card.appendChild(el('span', { class: 'rankbadge', text: 'Rank ' + row.rank + (WATCH[row.slug] ? ', watchlist' : '') }));
    card.appendChild(el('h2', { text: row.name }));
    var dsub = el('p', { class: 'dsub' });
    dsub.appendChild(el('span', { text: row.category || 'Uncategorised' }));
    dsub.appendChild(el('span', { text: row.chains.join(', ') || 'unknown chain' }));
    dsub.appendChild(el('span', { text: 'tracked since ' + (row.listed_at || 'unknown date') }));
    card.appendChild(dsub);
    card.appendChild(el('div', { class: 'bigval' }, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'implied launch value, the model’s claim, not a promise' })));
    if (valueAgree && stepsAgree) {
      card.appendChild(el('p', { class: 'checkline', text: 'Checked: this page recomputed the value and the farm plan from the snapshot figures, and both match board.json.' }));
    }
    var bd = el('table', { class: 'breakdown' });
    var bdRows = [
      ['TVL in the snapshot', fmtUsd(row.tvl_usd), ''],
      ['Multiple, ' + (row.category || 'Uncategorised'), row.multiple.toFixed(2) + '×', 'median mcap / TVL of live names in this category'],
      ['Growth, 7-day TVL ' + fmtPct(row.change_7d), '×' + v.growthMult.toFixed(2), 'change clamped to -50% to +100%, weight 0.4'],
      ['Maturity, ' + fmtAge(row.age_days) + ' tracked', '×' + v.maturity.toFixed(2), '0.70 + 0.30 × age / 3 years'],
      ['Breadth, ' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's'), '×' + v.breadth.toFixed(2), '+0.04 per extra chain, capped at 4'],
    ];
    bdRows.forEach(function (r) {
      bd.appendChild(el('tr', {}, el('td', {}, document.createTextNode(r[0]), el('small', { text: r[2] })), el('td', { text: r[1] })));
    });
    bd.appendChild(el('tr', { class: 'total' }, el('td', { text: 'Implied value' }), el('td', { text: fmtUsd(row.implied_value_usd) })));
    card.appendChild(bd);
    card.appendChild(el('h3', { text: 'Farm plan: what to do, what it costs, how long it takes' }));
    var ol = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s) {
      var parts = splitStep(s);
      ol.appendChild(el('li', {},
        document.createTextNode(parts.text),
        el('div', { class: 'chips' },
          parts.cost ? el('span', { class: 'chip cost', text: 'Cost: ' + parts.cost }) : null,
          parts.time ? el('span', { class: 'chip', text: 'Time: ' + parts.time }) : null)));
    });
    card.appendChild(ol);
    card.appendChild(el('p', { class: 'dnote', text: 'Records no token: the snapshot carries no market cap, no CoinGecko id and no symbol for this protocol. That is the record, not proof, and a farm position is at-risk capital. No token is promised, and no step here pays anyone to claim anything.' }));
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    card.scrollTop = 0;
    var closer = card.querySelector('.close');
    if (closer) closer.focus();
    syncHash();
  }
  var lastRow = null;
  function closeDetail() {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    state.selected = null;
    renderBoard();
    syncHash();
    if (lastRow) { var back = document.querySelector('tr[data-slug="' + lastRow + '"]'); if (back) back.focus(); lastRow = null; }
  }
  drawer.addEventListener('click', function (e) { if (e.target === drawer) closeDetail(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // ---- Tabs and controls ----
  var tabPre = document.getElementById('tab-pre');
  var tabLive = document.getElementById('tab-live');
  function setTab(tab) {
    state.tab = tab;
    tabPre.classList.toggle('active', tab === 'pre-token');
    tabLive.classList.toggle('active', tab === 'live');
    tabPre.setAttribute('aria-selected', tab === 'pre-token' ? 'true' : 'false');
    tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    document.getElementById('board').hidden = tab !== 'pre-token';
    document.getElementById('liveboard').hidden = tab !== 'live';
    document.querySelector('.tablehint').style.display = tab === 'pre-token' ? '' : 'none';
  }
  tabPre.addEventListener('click', function () { setTab('pre-token'); syncHash(); });
  tabLive.addEventListener('click', function () { setTab('live'); renderLive(); syncHash(); });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); syncHash(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); syncHash(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); syncHash(); });
  document.getElementById('watchonly').addEventListener('change', function (e) { state.watchonly = e.target.checked; renderBoard(); syncHash(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); syncHash(); });

  // State lives in the URL: filters, tab, sort and the open protocol, so a link reopens the same view.
  function readHash() {
    var p = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    if (p.get('tab') === 'live') setTab('live');
    if (p.get('q')) { state.q = p.get('q'); document.getElementById('q').value = state.q; }
    if (p.get('cat')) { state.category = p.get('cat'); catSel.value = state.category; }
    if (p.get('chain')) { state.chain = p.get('chain'); chainSel.value = state.chain; }
    if (p.get('wl') === '1') { state.watchonly = true; document.getElementById('watchonly').checked = true; }
    if (p.get('sort')) { state.sort = p.get('sort'); document.getElementById('sort').value = state.sort; }
    return p.get('detail');
  }
  function syncHash() {
    var p = new URLSearchParams();
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('cat', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.watchonly) p.set('wl', '1');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.selected) p.set('detail', state.selected);
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
  }
  var detailSlug = readHash();
  if (state.tab === 'live') renderLive();
  renderBoard();
  if (detailSlug) openDetail(detailSlug);

  window.__radarReady = true;
})();
