// Azimuth runs clockwise from north; zenith is the center, horizon the rim.
export function skyPosition(azimuth, elevation) {
  const r=96*(90-elevation)/90, a=azimuth*Math.PI/180;
  return {x:120+r*Math.sin(a),y:120-r*Math.cos(a)};
}
export function createSkyView(svg, status, selectSatellite) {
  const ns='http://www.w3.org/2000/svg', points=new Map();
  svg.innerHTML=`<g class="sky-grid"><circle cx="120" cy="120" r="96"/><circle cx="120" cy="120" r="64"/><circle cx="120" cy="120" r="32"/><path d="M24 120H216M120 24V216"/></g><g class="sky-labels"><text x="120" y="15">N</text><text x="230" y="124">E</text><text x="120" y="234">S</text><text x="10" y="124">W</text><text x="137" y="36">0°</text><text x="137" y="68">30°</text><text x="137" y="100">60°</text><text x="120" y="124">90°</text></g><g class="sky-points"></g>`;
  const layer=svg.querySelector('.sky-points');
  return (satellites,active,selected)=>{
    const visible=active?satellites.filter(s=>s.geo&&Number.isFinite(s.geo.azimuth)&&s.geo.elevation>0&&s.geo.elevation<=90):[];
    const ids=new Set(visible.map(s=>s.noradId));
    for(const [id,node] of points)if(!ids.has(id)){node.remove();points.delete(id);}
    for(const s of visible){
      let node=points.get(s.noradId);
      if(!node){
        node=document.createElementNS(ns,'g');node.setAttribute('role','button');node.setAttribute('tabindex','0');node.classList.add('sky-satellite');
        node.innerHTML='<title></title><circle class="sky-hit" r="9"/><circle class="sky-dot" r="3.5"/>';
        node.addEventListener('click',()=>selectSatellite(s.noradId));
        node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectSatellite(s.noradId);}});
        layer.append(node);points.set(s.noradId,node);
      }
      const p=skyPosition(s.geo.azimuth,s.geo.elevation),inclination=s.satrec.inclo*180/Math.PI;
      node.setAttribute('transform',`translate(${p.x},${p.y})`);
      node.style.color=Math.abs(inclination-53)<Math.abs(inclination-43)?'#b58aff':'#70d6ed';
      node.classList.toggle('selected',s.noradId===selected);
      const label=`${s.name.replace(/\s*\[DTC\]\s*/g,'')} · Az ${s.geo.azimuth.toFixed(1)}° · El ${s.geo.elevation.toFixed(1)}°`;
      node.setAttribute('aria-label',label);node.querySelector('title').textContent=label;
    }
    status.textContent=active?`${visible.length} above horizon`:'Select an observer location';
  };
}
