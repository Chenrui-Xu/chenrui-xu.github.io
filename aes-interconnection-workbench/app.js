'use strict';

// This viewer only reads a published export. It never sends API mutations or solves a model.
const $ = (id) => document.getElementById(id);
const escapeHTML = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(Math.abs(value) < 1e-8 ? 0 : value) : '—';
const signed = (value) => typeof value === 'number' && Number.isFinite(value) ? `${value > 1e-8 ? '+' : ''}${fmt(value)}` : '—';
const json = (value) => escapeHTML(JSON.stringify(value, null, 2));
const badge = (text, kind = '') => `<span class="badge ${kind}">${escapeHTML(text)}</span>`;
const table = (headers, rows, label) => `<div class="table-wrap"><table aria-label="${escapeHTML(label)}"><thead><tr>${headers.map(h => `<th scope="col">${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No recorded rows.</td></tr>`}</tbody></table></div>`;
const dt = (title, value, full = false) => `<div${full ? ' class="full"' : ''}><dt>${escapeHTML(title)}</dt><dd>${value}</dd></div>`;
const details = (title, value) => `<details><summary>${escapeHTML(title)}</summary><pre>${json(value)}</pre></details>`;
let publication;
const study = () => publication.runs[Number($('scenario-select').value)];
const result = (entry) => entry.run.result || {};
const rows = (entry) => result(entry).rows || [];
const yearsOf = (entry) => [...new Set(rows(entry).map(r => r.year))].sort((a,b) => a-b);
const sum = (entry, year, field) => rows(entry).filter(r => r.year === year).reduce((total, r) => total + (typeof r[field] === 'number' ? r[field] : 0), 0);
const projectLabel = (id) => {
  const p = (publication.projects || []).find(p => p.id === id);
  return `<strong>${escapeHTML(id)}</strong>${p && p.name !== id ? ` <span class="muted">· ${escapeHTML(p.name)}</span>` : ''}`;
};
const wait = (value) => value === null ? 'Not reached' : fmt(value);
const delta = (left, right) => typeof left === 'number' && typeof right === 'number' ? right-left : null;
const deltaCell = (value) => `<span class="${value < -1e-8 ? 'delta-negative' : value > 1e-8 ? 'delta-positive' : ''}">${signed(value)}</span>`;
const isValid = (entry) => entry.run.status === 'Succeeded' && result(entry).status === 'Succeeded' && result(entry).check?.passed === true;

// Account choice routes to the original backend login; it grants no permissions here.
const accountScopes = {
  gen: 'Generation developer: manage G0 / G1 resource submissions and timing.',
  load: 'Load developer: manage project A and C submissions and requirements.',
  loadb: 'Load developer: manage project B submissions and requirements.',
  engineer: 'Planning engineer: create scenarios, run the model and compare study results.',
  planner: 'Planning reviewer: inspect study evidence and record internal review decisions.'
};
async function startWorkbenchAccess() {
  const select = $('workbench-account'), action = $('open-workbench');
  const showScope = () => { $('workbench-scope').textContent = accountScopes[select.value] || ''; };
  showScope();
  try {
    const response = await fetch('./workbench.json', {cache:'no-cache'});
    if (!response.ok) throw new Error('Access configuration unavailable.');
    const config = await response.json();
    if (config.schema_version !== 1 || config.availability !== 'available' || typeof config.url !== 'string' || typeof config.notice !== 'string' || !config.notice.trim()) throw new Error('Full workbench unavailable.');
    const base = new URL(config.url);
    if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Full workbench address unavailable.');
    const update = () => {
      showScope();
      const target = new URL(base.href);
      target.searchParams.set('account', select.value);
      action.href = target.href;
    };
    select.disabled = false;
    select.addEventListener('change', update);
    update();
    action.hidden = false;
    $('workbench-availability').textContent = config.notice;
  } catch (_) {
    action.hidden = true;
    action.removeAttribute('href');
    select.disabled = true;
    $('workbench-availability').textContent = 'The full workbench is currently unavailable. The published studies below remain available. Ask the site owner to restore the backend connection.';
  }
}

function renderResults() {
  const entry = study(), r = result(entry);
  const valid = isValid(entry);
  $('results').innerHTML = `<article class="card"><div class="result-heading"><div><h2>${escapeHTML(entry.name)}</h2><p>Study version ${escapeHTML(entry.run.study_version)} · ${rows(entry).length} project-year result rows</p></div>${badge(valid ? 'Optimal · independently checked' : 'Unvalidated result', valid ? 'good' : 'warning')}</div>
    <div class="status-line">${badge(entry.run.status, valid ? 'good' : 'warning')}<span>${escapeHTML(r.reason || 'No solver reason recorded.')}</span></div>
    <div class="year-cards">${yearsOf(entry).map(y => `<div class="year-card"><small>${escapeHTML(y)} · Total actual service</small><strong>${fmt(sum(entry,y,'served_mw'))}<em>MW</em></strong><p>Connection plan ${fmt(sum(entry,y,'commissioning_cap_mw'))} MW<br>Served ${fmt(sum(entry,y,'served_mwh'))} MWh · curtailed ${fmt(sum(entry,y,'curtailment_mwh'))} MWh</p></div>`).join('')}</div>
    ${table(['Project / year','Connection plan MW','Actual service MW','Served MWh','Curtailment MWh','Wait, years'], rows(entry).map(row => [projectLabel(row.project_id) + ` / ${escapeHTML(row.year)}`,fmt(row.commissioning_cap_mw),`<span class="numeric">${fmt(row.served_mw)}</span>`,fmt(row.served_mwh),fmt(row.curtailment_mwh),wait(row.waiting_years)]), 'Selected study results by project and year')}
    <p class="fine-print">Actual service MW is the weighted average across modeled conditions. MWh covers sampled test periods (${fmt(r.settings?.hours_per_year)} modeled hours per year), not annual building energy. Waiting time uses annual resolution: ${escapeHTML(r.settings?.waiting_threshold || 'See the model settings below.')}</p></article>`;
  renderNetwork(entry);
  renderEvidence(entry);
}

function renderComparison() {
  const left = publication.runs[Number($('original-select').value)];
  const right = publication.runs[Number($('updated-select').value)];
  if (!left || !right) return;
  if (left === right) { $('comparison-results').innerHTML = '<p class="empty">Select two different studies to compare their recorded results.</p>'; return; }
  const years = [...new Set([...yearsOf(left),...yearsOf(right)])].sort((a,b) => a-b);
  const leftRows = new Map(rows(left).map(row => [`${row.project_id}|${row.year}`,row]));
  const rightRows = new Map(rows(right).map(row => [`${row.project_id}|${row.year}`,row]));
  const keys = [...new Set([...leftRows.keys(),...rightRows.keys()])].sort((a,b) => {
    const ar = leftRows.get(a) || rightRows.get(a), br = leftRows.get(b) || rightRows.get(b);
    return String(ar.project_id).localeCompare(String(br.project_id)) || ar.year-br.year;
  });
  const sameModel = result(left).model_version === result(right).model_version && left.snapshot.policy_version === right.snapshot.policy_version;
  $('comparison-results').innerHTML = `<div class="compare-note"><strong>${escapeHTML(left.name)}</strong> → <strong>${escapeHTML(right.name)}</strong><br>${sameModel ? 'Same recorded model and policy versions.' : 'Model or policy versions differ; interpret changes with that difference in mind.'} This comparison is a published snapshot, not a new model run.${!isValid(left) || !isValid(right) ? '<br>At least one study is not independently validated; do not treat this comparison as a successful recommendation.' : ''}</div>
    <div class="year-cards">${years.map(y => { const hasBoth = yearsOf(left).includes(y) && yearsOf(right).includes(y); return `<div class="year-card compare-year"><small>${escapeHTML(y)} · Δ actual service</small><strong>${hasBoth ? signed(sum(right,y,'served_mw')-sum(left,y,'served_mw')) : '—'}<em>MW</em></strong><p>${fmt(sum(left,y,'served_mw'))} → ${fmt(sum(right,y,'served_mw'))} MW</p></div>`; }).join('')}</div>
    ${table(['Project / year','Original service MW','Updated service MW','Δ service MW','Δ connection MW','Δ served MWh','Δ curtailment MWh','Original wait, years','Updated wait, years','Δ wait, years'],keys.map(key => {const l=leftRows.get(key), r=rightRows.get(key), item=r||l; return [projectLabel(item.project_id)+` / ${escapeHTML(item.year)}`,fmt(l?.served_mw),fmt(r?.served_mw),deltaCell(delta(l?.served_mw,r?.served_mw)),deltaCell(delta(l?.commissioning_cap_mw,r?.commissioning_cap_mw)),deltaCell(delta(l?.served_mwh,r?.served_mwh)),deltaCell(delta(l?.curtailment_mwh,r?.curtailment_mwh)),l?wait(l.waiting_years):'—',r?wait(r.waiting_years):'—',deltaCell(delta(l?.waiting_years,r?.waiting_years))];}), 'Scenario comparison by project and year')}
    <p class="fine-print">A dash means a missing or nonnumeric metric; “Not reached” means the wait threshold was not met in the horizon. It is not zero waiting time. Waiting is measured from each study’s own project-ready year, so a changed ready year changes the reference date.</p>
    ${details('Recorded input changes', inputChanges(left.snapshot.input,right.snapshot.input))}`;
}

function inputChanges(left, right, path = '') {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    return [...new Set([...Object.keys(left),...Object.keys(right)])].flatMap(k => inputChanges(left[k],right[k],path ? `${path}.${k}` : k));
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.every(x => x && typeof x === 'object' && 'id' in x) && right.every(x => x && typeof x === 'object' && 'id' in x)) {
      const l = new Map(left.map(x => [x.id,x])), r = new Map(right.map(x => [x.id,x]));
      return [...new Set([...l.keys(),...r.keys()])].flatMap(k => inputChanges(l.get(k),r.get(k),`${path}[${k}]`));
    }
  }
  return [{field:path,original:left === undefined ? null : left,updated:right === undefined ? null : right}];
}

function renderNetwork(entry) {
  const input = entry.snapshot.input;
  $('network-results').innerHTML = `<p class="fine-print">Selected study: <strong>${escapeHTML(entry.name)}</strong>. A binding line reaches its limit in this solution; it is not necessarily the sole cause of a change. Flow sign follows the frozen input’s from-bus → to-bus orientation. Generation nameplate capacity is not deliverable capacity.</p>
    ${(result(entry).operations || []).map(op => `<article class="operation"><h3>${escapeHTML(op.year)}<span>Condition: ${escapeHTML(op.condition)}</span></h3><div class="operation-grid"><div><h3>Line flows</h3>${table(['Line','From → to','Flow MW','Limit MW','Status'],(op.lines||[]).map(line => {const spec=(input.lines||[]).find(x=>x.id===line.id);return [escapeHTML(line.id),spec?`${escapeHTML(spec.from_bus)} → ${escapeHTML(spec.to_bus)}`:'—',fmt(line.flow_mw),fmt(line.limit_mw),badge(line.binding?'Binding':'Headroom',line.binding?'warning':'good')];}), `Line flows ${op.year} ${op.condition}`)}</div><div><h3>Generation dispatch</h3>${table(['Generator','Dispatch MW','Available MW'],(op.generators||[]).map(gen => [escapeHTML(gen.id),fmt(gen.p_mw),fmt(gen.available_mw)]),`Generation dispatch ${op.year} ${op.condition}`)}</div></div></article>`).join('') || '<p class="empty">No network operations recorded for this study.</p>'}
    <div class="resources"><div><h3>Frozen generation inputs</h3>${table(['Resource','Bus','Capacity MW','Ready year'],(input.generators||[]).map(gen => [escapeHTML(gen.id),escapeHTML(gen.bus),fmt(gen.capacity_mw),escapeHTML(gen.ready_year)]),'Frozen generation inputs')}</div><div><h3>Frozen line / upgrade inputs</h3>${table(['Line','Base limit MW','Upgrade year','Upgrade limit MW'],(input.lines||[]).map(line => [escapeHTML(line.id),fmt(line.limit_mw),line.upgrade_year===null?'Not scheduled':escapeHTML(line.upgrade_year),fmt(line.upgrade_limit_mw)]),'Frozen line and upgrade inputs')}</div></div>`;
}

function renderEvidence(entry) {
  const {run,snapshot} = entry, r = result(entry), c = r.check || {};
  // Scenario hashes include revision/version provenance; the solver hashes only physical inputs.
  const agree = Boolean(run.input_hash) && run.input_hash === snapshot.input_hash;
  const decision = run.decision;
  $('evidence-results').innerHTML = `<div class="status-line">${badge(c.passed?'Independent checker passed':'Independent checker not passed',c.passed?'good':'warning')}${badge(agree?'Recorded input hashes agree':'Recorded input hashes missing / differ',agree?'good':'warning')}</div>
    <p class="fine-print">These are the checker and provenance records exported with the frozen run. This static page does not rerun physical checks or independently recompute the input hash.</p>
    <dl class="metadata">${dt('Run ID',`<code>${escapeHTML(run.id)}</code>`)}${dt('Frozen study version',escapeHTML(snapshot.study_version))}${dt('Model version',escapeHTML(r.model_version))}${dt('Policy version',escapeHTML(snapshot.policy_version))}${dt('Solver version',escapeHTML(r.solver_version))}${dt('Maximum recorded residual',c.max_residual_mw == null ? '—' : `${escapeHTML(Number(c.max_residual_mw).toExponential(3))} MW`)}${dt('Configured tolerance',`${escapeHTML(r.settings?.tolerance_mw)} MW`)}${dt('Recorded objective',fmt(r.objective))}${dt('Scenario input + revision/version hash',`<code>${escapeHTML(run.input_hash)}</code>`,true)}${dt('Solver physical input hash',`<code>${escapeHTML(r.input_hash)}</code>`,true)}</dl>
    <h3>Frozen load project inputs</h3>${table(['Project','Bus','Requested MW','Ready year','Maximum curtailment fraction'],(snapshot.input.loads||[]).map(load=>[projectLabel(load.id),escapeHTML(load.bus),fmt(load.requested_mw),escapeHTML(load.ready_year),fmt(load.rho)]),'Frozen load project inputs')}
    <div class="decision" style="margin-top:22px"><h3>Internal decision ${decision ? `· ${escapeHTML(decision.action)}` : '· No recorded decision'}</h3>${decision ? `<p>${escapeHTML(decision.reason)}</p><p class="fine-print">Recorded at ${escapeHTML(decision.created_at)}</p>` : '<p>This published result has no internal review decision.</p>'}<p class="fine-print"><strong>Internal acceptance is not external interconnection or energization approval.</strong> External authorization: ${decision?.external_authorization ? escapeHTML(JSON.stringify(decision.external_authorization)) : 'not recorded'}.</p></div>
    ${details('Solver settings and metric definitions',r.settings)}${details('Independent checker record',c)}${details('Frozen input and revision references',snapshot)}${details('Full internal decision record',decision||null)}`;
}

function download(contents, filename, mime) {
  const blob = new Blob([contents],{type:mime});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function filename(entry) { return String(entry.name).replace(/[^a-z0-9-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'published-study'; }
function csvCell(value) { return `"${String(value ?? '').replace(/"/g,'""')}"`; }
function downloadCSV() {
  const entry=study(), fields=['project_id','year','commissioning_cap_mw','served_mw','served_mwh','curtailment_mwh','waiting_years'];
  const provenance=['study_name','run_id','input_hash','model_version','policy_version','energy_scope'];
  const records=rows(entry).map(row=>[...fields.map(f=>row[f]),entry.name,entry.run.id,entry.run.input_hash,result(entry).model_version,entry.snapshot.policy_version,result(entry).settings?.energy_scope]);
  download([[...fields,...provenance],...records].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n',filename(entry)+'.csv','text/csv;charset=utf-8');
}

async function start() {
  try {
    const response=await fetch('./data.json',{cache:'no-cache'});
    if(!response.ok) throw new Error(`Study export could not be loaded (HTTP ${response.status}).`);
    publication=await response.json();
    if(publication.schema_version!==1 || publication.source!=='synthetic' || !Array.isArray(publication.runs) || !publication.runs.length || publication.runs.some(entry=>!entry.run || !entry.snapshot?.input)) throw new Error('The published study export is missing or has an unsupported schema.');
    const options=publication.runs.map((entry,i)=>`<option value="${i}">${escapeHTML(entry.name)}</option>`).join('');
    ['scenario-select','original-select','updated-select'].forEach(id=>{$(id).innerHTML=options;});
    $('updated-select').value=String(Math.min(1,publication.runs.length-1));
    $('scenario-select').addEventListener('change',renderResults);
    ['original-select','updated-select'].forEach(id=>$(id).addEventListener('change',renderComparison));
    $('swap-studies').addEventListener('click',()=>{const first=$('original-select').value;$('original-select').value=$('updated-select').value;$('updated-select').value=first;renderComparison();});
    $('download-json').addEventListener('click',()=>{const entry=study();download(JSON.stringify({schema_version:publication.schema_version,source:publication.source,exported_at:publication.exported_at,boundary:publication.boundary,projects:publication.projects,...entry},null,2)+'\n',filename(entry)+'.json','application/json');});
    $('download-csv').addEventListener('click',downloadCSV);
    $('boundary').textContent=publication.boundary || 'Synthetic demonstration. Simplified DC screening only; internal acceptance is not formal interconnection approval.';
    const timestamp=new Date(publication.exported_at);
    $('exported-at').textContent=`Published export: ${Number.isNaN(timestamp.getTime()) ? publication.exported_at : timestamp.toISOString().replace('T',' ').replace('.000Z',' UTC')}`;
    renderResults();renderComparison();
    $('loading').hidden=true;$('viewer').hidden=false;
    document.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(a=>a.classList.remove('active'));link.classList.add('active');}));
  } catch(error) {
    $('loading').hidden=true;$('error').hidden=false;
    $('error').textContent=`Unable to display this published study. ${error.message} Please reload the page or ask the publisher to refresh the export.`;
  }
}
startWorkbenchAccess();
start();
