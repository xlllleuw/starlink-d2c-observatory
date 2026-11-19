const escape = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Keep paired UL/DL allocations aligned, including multiple bands. */
export function renderSpectrumPairs(operator) {
  const pairs = operator.spectrumPairs || [{uplink:operator.uplink,downlink:operator.downlink,band:operator.band}];
  return `<table class="spectrum-pairs"><thead><tr><th>Uplink MHz</th><th>Downlink MHz</th><th>Band</th></tr></thead><tbody>${pairs.map(pair=>`<tr><td>${escape(pair.uplink)}</td><td>${escape(pair.downlink)}</td><td>${escape(pair.band)}</td></tr>`).join('')}</tbody></table>`;
}

export function spectrumBands(operator) {
  return [...new Set((operator.spectrumPairs || [{band:operator.band}]).map(pair=>pair.band).filter(Boolean))].join(' / ') || '—';
}
