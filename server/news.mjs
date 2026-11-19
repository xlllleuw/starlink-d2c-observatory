/** Curated bibliography only. No external news feeds are fetched. */
export async function fetchNews({fallbackItems=[]}={}) {
  const items=fallbackItems.filter(item=>item.type==='research' && item.thesisReference && /^https:\/\//.test(item.url));
  return {items, status:'curated', source:'Selected thesis references', researchPolicy:'curated_thesis_references', liveCount:0, failures:[]};
}
