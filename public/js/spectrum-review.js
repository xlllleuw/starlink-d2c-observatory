import { renderSpectrumPairs, spectrumBands } from './spectrum.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>/^https?:\/\//i.test(value||'')?esc(value):'#';
const labels={commercial:'Commercial',available:'Commercial',trial:'Trial',public_trial:'Public trial',announced:'Announced',unknown:'Unknown',emergency:'Emergency',filing:'Filing only'};
const badge=value=>`<span class="badge ${esc(value)}">${esc(labels[value]||value||'Unknown')}</span>`;
const sourceLabel=(source,index)=>{try{return source.titleEn||`Source ${index+1} · ${new URL(source.url).hostname}`;}catch{return `Source ${index+1}`;}};
const sourceList=sources=>sources?.length?`<ul class="sources">${sources.map((s,index)=>`<li><a href="${url(s.url)}" target="_blank" rel="noopener">${esc(sourceLabel(s,index))} ↗</a>${s.publishedAt?` · ${esc(s.publishedAt)}`:' · publication date not stated'}</li>`).join('')}</ul>`:'';

async function init(){
  const [review,fcc]=await Promise.all(['/data/spectrum-review.json','/data/fcc-review.json'].map(async path=>{const r=await fetch(path);if(!r.ok)throw Error(`Cannot load ${path}: HTTP ${r.status}`);return r.json();}));
  const countries=review.countries;
  const rows=countries.flatMap(c=>c.operators.map(o=>({c,o}))).sort((a,b)=>a.o.recordOrder-b.o.recordOrder);
  $('review-date').textContent=review.asOf;
  $('country-count').textContent=countries.length;
  $('operator-count').textContent=rows.length;
  $('notice-count').textContent=fcc.section165Rows;
  function renderRecords(){
    const query=$('review-search').value.trim().toLowerCase(),status=$('review-status').value;
    const visible=rows.filter(({c,o})=>`${c.name} ${c.id} ${o.name} ${o.band} ${o.plmn||''}`.toLowerCase().includes(query)&&(!status||o.serviceStatus===status));
    $('record-summary').textContent=`${visible.length} of ${rows.length} spectrum records`;
    $('records-body').innerHTML=visible.map(({c,o})=>`<tr id="${esc(c.id)}-${esc(o.name.replace(/\W+/g,'-'))}"><td><strong>${esc(c.name)}</strong>${esc(o.name)}<small>${esc(c.id)}</small></td><td>${badge(o.serviceStatus)}${o.serviceStart?`<small>Start: ${esc(o.serviceStart)}</small>`:''}<small>Checked: ${esc(o.checkedAt||c.checkedAt||c.statusCheckedAt||review.asOf)}</small></td><td class="freq">${renderSpectrumPairs(o)}</td><td>${esc(spectrumBands(o))}<small>${esc(o.plmn||'—')}</small></td><td><details><summary>Service evidence</summary><p>${esc(o.statusDetail||c.statusDetail)}</p>${sourceList(o.statusSources)}</details><details><summary>${o.spectrumVerification==='official_document'?'Spectrum: supporting official evidence':'Spectrum: updated Table 3.5'}</summary><p>${esc(o.spectrumNote||'Latest regulatory terms have not been independently reverified.')}</p>${sourceList(o.spectrumSources)}<p>${esc(o.plmnVerification||'DTC PLMN not independently reverified.')}</p><a href="${url(o.filingUrl)}" target="_blank" rel="noopener">FCC application directory ↗</a></details></td></tr>`).join('')||'<tr><td colspan="5">No matching records.</td></tr>';
  }
  $('review-search').addEventListener('input',renderRecords);$('review-status').addEventListener('change',renderRecords);renderRecords();
  const sourceMap=Array.isArray(review.sources)?Object.fromEntries(review.sources.map(s=>[s.id,s])):review.sources||{};
  $('partner-cards').innerHTML=(review.additionalPartners||[]).map(p=>`<article class="partner"><h3>${esc(p.operator||p.name)} · ${esc(p.country||p.countryName||countries.find(c=>c.id===p.countryId)?.name||p.countryId)}</h3>${badge(p.serviceStatus)}<p>${esc(p.statusDetail)}</p>${sourceList(p.statusSources||p.sources||(p.sourceIds||[]).map(id=>sourceMap[id]).filter(Boolean))}<p class="muted">No additional MHz or numeric DTC PLMN inferred from this partnership.</p></article>`).join('');
  function renderFcc(){
    const query=$('fcc-search').value.toLowerCase().trim();
    const visible=fcc.notices.filter(n=>`${n.id} ${n.filedAt} ${n.attachments.map(a=>a.title).join(' ')}`.toLowerCase().includes(query));
    $('fcc-body').innerHTML=visible.map(n=>`<tr><td class="freq">${esc(n.filedAt.slice(0,10))}</td><td><code>${esc(n.id)}</code></td><td>${n.attachments.map(a=>`<a href="${url(a.url)}" target="_blank" rel="noopener">${esc(a.title)} ↗</a>`).join('<br>')}</td><td><span class="badge">Directory only</span><small>Attachment link index</small></td></tr>`).join('')||'<tr><td colspan="4">No matching notifications.</td></tr>';
  }
  $('fcc-search').addEventListener('input',renderFcc);renderFcc();
}
init().catch(error=>{$('load-error').hidden=false;$('load-error').textContent=`The review could not load. ${error.message}`;});
