import { createSkyView } from './sky.js';
import { loadTacModel, tacCenter, nearestTac, tacBoundary, tacNeighbors, nearbyTacs, TAC_MODEL, isReservedTac } from './tac.js';
import { parseObserverCoordinates } from './coordinates.js';
import { createBasemapController } from './basemaps.js';
import { renderSpectrumPairs, spectrumBands } from './spectrum.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => { try {const u = new URL(value, location.origin); return ['http:','https:'].includes(u.protocol) ? esc(u.href) : '#';} catch { return '#'; } };
const shortName = name => name.replace(/\s*\[DTC\]\s*/g, '');
const statusText = { available:'Commercial',commercial:'Commercial',trial:'Trial',announced:'Announced',coming:'Trial / Coming soon',emergency:'Emergency',unknown:'Unknown',filing:'Filing only' };
const typeText = { news:'News',research:'Selected research' };
const state = {observerSelected:false,lat:40.4168,lon:-3.7038,locationName:'Madrid, Spain',selectedSat:null,orbitRequested:false,countryId:'ESP',tacId:null,tacCountryId:null,basemap:'osm',detail:'satellite',mode:'3d',satellites:[],countries:[],additionalPartners:[],news:[],tacReady:false,orbitData:null,countryTacs:{}};
let C, viewer, pointCollection, countryLayer, tacLayer, tacOutlines, basemaps, observerEntity, orbitEntity, satelliteLabel, lastOrbitAt=0, toastTimer, tickCount=0, lastCandidates='', lastTacFocus='', countryFeatures=[];
const colors = {};
const renderSky=createSkyView($('sky-view'),$('sky-status'),id=>selectSatellite(id));
renderSky([],false,null);
function satelliteColor(satrec) {return Math.abs(satrec.inclo*180/Math.PI-53)<Math.abs(satrec.inclo*180/Math.PI-43)?colors.purple:colors.cyan;}
function toast(message) { $('map-toast').textContent=message; $('map-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('map-toast').classList.remove('visible'),5000); }
function formatCoords(lat,lon,digits=3) {return `${Math.abs(lat).toFixed(digits)}° ${lat>=0?'N':'S'} · ${Math.abs(lon).toFixed(digits)}° ${lon>=0?'E':'W'}`;}
function utc(value) {const d=new Date(value);return Number.isFinite(+d)?d.toISOString().replace('T',' ').slice(0,16)+' UTC':'Unknown';}
function ageHours(epoch) {return (Date.now()-new Date(epoch).getTime())/36e5;}
function metric(label,value,unit='',featured=false) {return `<div class="metric${featured?' featured':''}"><label>${label}</label><b>${esc(value)}<small>${unit}</small></b></div>`;}
async function json(url,timeout=20000) {const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
function currentCountry() {return state.countries.find(c=>c.id===state.countryId);}
function serviceBadge(status) {const key=Object.hasOwn(statusText,status)?status:'unknown';return `<span class="tag service-badge status-${key}">${statusText[key]}</span>`;}
function renderOperator(operator) {
  return `<article class="operator-card"><div class="operator-title"><span>${esc(operator.name)}</span><span class="tag gray-tag">${esc(spectrumBands(operator))}</span></div><div class="operator-service">${serviceBadge(operator.serviceStatus)}</div>${renderSpectrumPairs(operator)}<div class="frequency-row"><span>PLMN</span><b>${esc(operator.plmn||'—')}</b></div></article>`;
}
function setDetail(type) {state.detail=type;$('country-browser').hidden=type!=='country';document.querySelector('.candidates-panel').hidden=type!=='satellite';document.querySelectorAll('[data-detail]').forEach(b=>b.classList.toggle('active',b.dataset.detail===type));renderDetail();}
function setPage(page) {document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('map-page').hidden=page!=='map';$('news-page').hidden=page!=='news';if(page==='map'&&viewer){viewer.resize();viewer.scene.requestRender();}if(page==='news')renderNews();}

function renderCountryList() {
  const q=$('country-search').value.trim().toLowerCase();
  const items=state.countries.filter(c=>{
    const additional=(c.additionalPartnerRefs||[]).map(id=>state.additionalPartners.find(partner=>partner.id===id)?.operator||'').join(' ');
    return `${c.name} ${c.nameEn} ${c.id} ${c.operators.map(o=>o.name+' '+o.band).join(' ')} ${additional}`.toLowerCase().includes(q);
  });
  $('countries-count').textContent=state.countries.length;
  $('country-list').innerHTML=items.length?items.map(c=>`<button class="country-row${c.id===state.countryId?' active':''}" data-country="${c.id}"><span class="country-code">${c.id}</span><span class="country-text">${esc(c.name)}</span><i class="status-dot ${esc(c.status||'unknown')}"></i><span class="country-status">${statusText[c.status]||statusText.unknown}</span></button>`).join(''):'<div class="empty-state">No matching countries or operators.</div>';
}
function hideTacGrid() {
  $('layer-tac').checked=false;
  if(tacLayer){tacLayer.show=false;tacLayer.entities.removeAll();}
  if(tacOutlines){tacOutlines.show=false;tacOutlines.removeAll();}
  lastTacFocus='';
  if(viewer)viewer.scene.requestRender();
}
function clearObserver() {
  hideTacGrid();
  state.observerSelected=false;state.locationName='';
  if(observerEntity)observerEntity.show=false;
  $('observer-lat').value='';$('observer-lon').value='';
  $('location-name').textContent='No location selected';$('coordinate-error').hidden=true;
  renderSky([],false,null);updatePositions();
  if(viewer)viewer.scene.requestRender();
}
function setObserver(lat,lon,name,fly=false,countryId=undefined,keepCountryGrid=false) {
  state.observerSelected=true;
  state.lat=lat;state.lon=lon;state.locationName=name||'Selected location';state.tacId=nearestTac(lat,lon);
  if(!keepCountryGrid)state.tacCountryId=null;
  state.countryId=countryId===undefined?countryAt(lat,lon):countryId;renderCountryList();highlightCountries();
  $('location-name').textContent=state.locationName;$('observer-lat').value=Number(lat.toFixed(6));$('observer-lon').value=Number(lon.toFixed(6));$('coordinate-error').hidden=true;
  if(observerEntity){observerEntity.show=true;observerEntity.position=C.Cartesian3.fromDegrees(lon,lat,1500);}
  updatePositions();refreshTac();renderDetail();
  if(fly){viewer.scene.completeMorph();viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(lon,lat,2200000),duration:1.4});}
}
function selectCountry(id,fly=true) {
  const c=state.countries.find(x=>x.id===id);if(!c)return;
  state.tacCountryId=id;$('layer-tac').checked=true;
  state.countryId=id;setObserver(c.lat,c.lon,c.name,false,id,true);setDetail('country');renderCountryList();
  if(fly&&viewer){setPage('map');fitCountry(id);}
  highlightCountries();
}
function fitCountry(id) {
  const c=state.countries.find(x=>x.id===id),entry=state.countryTacs[id];if(!c||!viewer)return;
  viewer.scene.completeMorph();
  if(!entry){viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(c.lon,c.lat,6000000),duration:1.4});return;}
  const b=entry.bounds,span=b.longitudeSpan??((b.east-b.west+360)%360),padLon=Math.max(.7,span*.07),padLat=Math.max(.7,(b.north-b.south)*.09);
  const wrap=x=>((x+180)%360+360)%360-180;
  const rectangle=C.Rectangle.fromDegrees(wrap(b.west-padLon),Math.max(-89.5,b.south-padLat),wrap(b.east+padLon),Math.min(89.5,b.north+padLat));
  viewer.camera.flyTo({destination:rectangle,duration:1.5});
}
function selectSatellite(id,fly=false) {
  const sat=state.satellites.find(x=>x.noradId===Number(id));if(!sat)return;
  if(!sat.geo){toast(`${shortName(sat.name)} has no valid position for the current orbital elements.`);return;}
  state.selectedSat=sat.noradId;state.orbitRequested=true;setDetail('satellite');lastOrbitAt=0;updatePositions();
  if(fly&&sat.geo){viewer.scene.completeMorph();viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(sat.geo.lon,sat.geo.lat,2200000),duration:1.4});}
}
function selectTac(id,fly=false,openDetail=true) {
  if(!Number.isInteger(id)||id<0||id>=65536){toast('Enter a TAC ID from 0 to 65535.');return;}
  state.tacId=id;const center=tacCenter(id);
  if(fly)setObserver(center.lat,center.lon,`TAC ${id} center`,true,undefined,Boolean(state.tacCountryId));
  $('layer-tac').checked=true;if(tacLayer)tacLayer.show=true;if(openDetail)setDetail('tac');else renderDetail();lastTacFocus='';refreshTac();
}

function renderDetail() {
  if(state.detail==='satellite') {
    const sat=state.satellites.find(s=>s.noradId===state.selectedSat);
    if(!sat||!sat.geo){$('detail-content').innerHTML='<div class="empty-state">Loading valid orbits.<br>Select a satellite once the data is ready.</div>';return;}
    const g=sat.geo, hours=ageHours(sat.epoch);
    $('detail-content').innerHTML=`<div class="object-eyebrow">SATELLITE TELEMETRY</div><div class="object-heading"><h2>${esc(shortName(sat.name))}</h2><span class="sat-icon">✥</span></div><div class="subline"><span class="tag">DIRECT TO CELL</span><span>NORAD ${sat.noradId}</span></div><div class="detail-grid">${metric('Altitude',g.height.toFixed(1),'km')}${metric('Speed',g.speed.toFixed(2),'km/s')}${metric('Local elevation',state.observerSelected?g.elevation.toFixed(1):'—','°',true)}${metric('Slant range',state.observerSelected?g.range.toFixed(0):'—','km')}${metric('Inclination',(sat.satrec.inclo*180/Math.PI).toFixed(2),'°')}${metric('Azimuth',state.observerSelected?g.azimuth.toFixed(1):'—','°')}</div><div class="detail-meta">Subsatellite point ${formatCoords(g.lat,g.lon,2)}<br>Orbital epoch ${utc(sat.epoch)}<br>Element age ${hours.toFixed(1)} h · SGP4 at the current time</div>${hours>72?'<div class="warning-note">These orbital elements are over 72 hours old; position estimates may be less accurate.</div>':''}<button class="action-button" id="focus-satellite">⌖ Locate satellite</button>`;
  } else if(state.detail==='country') {
    const c=currentCountry();if(!c){$('detail-content').innerHTML='<div class="empty-state">Select a country from the list.</div>';return;}
    const entry=state.countryTacs[c.id];
    const gridSummary=entry?`<div class="country-grid-summary">TAC cells · <strong>${entry.count.toLocaleString('en-US')}</strong><button class="text-button" id="fit-country" style="display:block;margin-top:8px">Show full country ↗</button></div>`:'';
    $('detail-content').innerHTML=`<div class="object-eyebrow">COUNTRY & SPECTRUM / ${c.id}</div><div class="object-heading"><h2>${esc(c.name)}</h2>${serviceBadge(c.status)}</div>${c.operators.map(renderOperator).join('')}${gridSummary}`;
  } else {
    const id=state.tacId;
    if(id==null){$('detail-content').innerHTML='<div class="empty-state">This location is outside the model latitude band.<br>Select a location between approximately 70° S and 70° N.</div>';return;}
    const center=tacCenter(id);
    $('detail-content').innerHTML=`<div class="object-eyebrow">TRACKING AREA</div><div class="object-heading"><h2>TAC ${id}</h2><span class="tac-icon">⬡</span></div><div class="detail-grid">${metric('Center latitude',Math.abs(center.lat).toFixed(3),center.lat>=0?'° N':'° S')}${metric('Center longitude',Math.abs(center.lon).toFixed(3),center.lon>=0?'° E':'° W')}${metric('TAC hexadecimal','0x'+id.toString(16).padStart(4,'0').toUpperCase())}</div>`;
  }
}

async function createGlobe() {
  C=window.Cesium;C.Ion.defaultAccessToken='';
  colors.cyan=C.Color.fromCssColorString('#63e7ef');colors.purple=C.Color.fromCssColorString('#bd8aff');colors.amber=C.Color.fromCssColorString('#e8b96b');
  viewer=new C.Viewer('globe',{animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,baseLayer:false,skyBox:false,skyAtmosphere:new C.SkyAtmosphere(),requestRenderMode:true,maximumRenderTimeChange:Infinity,contextOptions:{webgl:{alpha:true,antialias:true}},shouldAnimate:false,orderIndependentTranslucency:false});
  viewer.scene.backgroundColor=C.Color.TRANSPARENT;viewer.scene.globe.baseColor=C.Color.fromCssColorString('#162d3c');viewer.scene.globe.enableLighting=false;viewer.scene.globe.showGroundAtmosphere=false;
  viewer.scene.skyAtmosphere.brightnessShift=-0.45;viewer.scene.skyAtmosphere.saturationShift=-0.5;
  viewer.scene.fog.enabled=false;if(viewer.scene.sun)viewer.scene.sun.show=false;if(viewer.scene.moon)viewer.scene.moon.show=false;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance=100;viewer.scene.screenSpaceCameraController.maximumZoomDistance=45000000;
  viewer.useBrowserRecommendedResolution=false;viewer.resolutionScale=Math.min(window.devicePixelRatio||1,2)/(window.devicePixelRatio||1);viewer.scene.postProcessStages.fxaa.enabled=false;
  basemaps=createBasemapController(C,viewer,{onError:message=>toast(message),onChange:id=>{state.basemap=id;lastTacFocus='';refreshTac();}});
  await basemaps.set('osm');
  pointCollection=viewer.scene.primitives.add(new C.PointPrimitiveCollection());
  tacOutlines=viewer.scene.primitives.add(new C.PrimitiveCollection());
  countryLayer=new C.CustomDataSource('countries');tacLayer=new C.CustomDataSource('TAC candidate model');viewer.dataSources.add(countryLayer);viewer.dataSources.add(tacLayer);
  observerEntity=viewer.entities.add({id:'observer',show:state.observerSelected,position:C.Cartesian3.fromDegrees(state.lon,state.lat,1500),point:{color:colors.amber,pixelSize:7,outlineColor:C.Color.fromCssColorString('#533c1f'),outlineWidth:4,disableDepthTestDistance:0},label:{text:'Observer',font:'11px sans-serif',fillColor:colors.amber,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,18),distanceDisplayCondition:new C.DistanceDisplayCondition(0,16000000)}});
  satelliteLabel=viewer.entities.add({id:'selected-satellite-label',label:{text:'',font:'11px sans-serif',fillColor:C.Color.WHITE,style:C.LabelStyle.FILL_AND_OUTLINE,outlineWidth:3,outlineColor:C.Color.fromCssColorString('#06101a'),pixelOffset:new C.Cartesian2(12,-14),horizontalOrigin:C.HorizontalOrigin.LEFT}});
  globalView(false);
  viewer.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  const handler=new C.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(click=>{
    const pick=viewer.scene.pick(click.position), id=pick?.id;
    if(id===observerEntity||id?.id==='observer'){clearObserver();return;}
    if(id?.kind==='satellite'){selectSatellite(id.noradId);return;}
    if(id?.id?.startsWith('tac-')){const tid=Number(id.id.slice(4));const hit=globeCoordinate(click.position);if(hit)setObserver(hit.lat,hit.lon,'Selected location',false,undefined,Boolean(state.tacCountryId));selectTac(tid,false,false);return;}
    if(state.tacCountryId&&$('layer-tac').checked){const hit=globeCoordinate(click.position);const tid=hit?nearestTac(hit.lat,hit.lon):null;if(tid!==null&&state.countryTacs[state.tacCountryId]?.ids.includes(tid)){setObserver(hit.lat,hit.lon,'Selected location',false,undefined,true);selectTac(tid,false,false);return;}}
    if(id?.id?.startsWith('country-')){const code=id.id.slice(8).split('_')[0];if(state.countries.some(c=>c.id===code)){selectCountry(code);return;}}
    const point=globeCoordinate(click.position);if(point){setObserver(point.lat,point.lon,'Selected location');toast('Observer location and visible satellites updated.');}
  },C.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(click=>{const point=globeCoordinate(click.position);if(point){setObserver(point.lat,point.lon,'Selected location');}},C.ScreenSpaceEventType.RIGHT_CLICK);
  viewer.camera.moveEnd.addEventListener(()=>{if(!state.tacReady||state.tacCountryId)return;const center=globeCoordinate(new C.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2));if(center&&viewer.camera.positionCartographic.height<5500000)refreshTac(center);});
  viewer.scene.renderError.addEventListener((scene,error)=>{console.error(error);toast('Map rendering failed. Please reload the page.');});
}
function globeCoordinate(position) {const ray=viewer.camera.getPickRay(position);const p=ray&&viewer.scene.globe.pick(ray,viewer.scene);if(!p)return null;const g=C.Cartographic.fromCartesian(p);return {lat:C.Math.toDegrees(g.latitude),lon:C.Math.toDegrees(g.longitude)};}
function globalView(animate=true) {const target={destination:C.Cartesian3.fromDegrees(9,27,14500000),duration:animate?1.5:0};if(animate)viewer.camera.flyTo(target);else viewer.camera.setView(target);}
function setView(mode) {
  if(mode===state.mode)return;state.mode=mode;document.querySelectorAll('.view-toggle button').forEach(b=>b.classList.toggle('active',b.id===`view-${mode}`));
  const center=globeCoordinate(new C.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2))||{lat:state.lat,lon:state.lon};
  const height=Math.max(80000,Math.min(25000000,viewer.camera.positionCartographic.height));
  const remove=viewer.scene.morphComplete.addEventListener(()=>{remove();viewer.camera.setView({destination:C.Cartesian3.fromDegrees(center.lon,center.lat,height)});viewer.scene.requestRender();});
  if(mode==='2d')viewer.scene.morphTo2D(.8);else viewer.scene.morphTo3D(.8);
  $('map-mode-label').textContent=mode==='2d'?'2D · Geographic projection':'3D · WGS84';
}
async function addCountries() {
  const [geo,detailed]=await Promise.all([json('/data/world.geojson'),json('/data/country-boundaries.geojson')]);
  countryFeatures=detailed.features;
  const detailedIds=new Set(countryFeatures.map(f=>f.id||f.properties.id));
  const features=[...geo.features.filter(f=>!detailedIds.has(f.id||f.properties.id)),...countryFeatures];
  for(const feature of features){
    const id=feature.id||feature.properties.id;const country=state.countries.find(c=>c.id===id);
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(let i=0;i<polygons.length;i++){
      const rings=polygons[i];if(!rings[0]?.length)continue;
      const position=ring=>C.Cartesian3.fromDegreesArray(ring.flatMap(p=>[p[0],p[1]]));
      countryLayer.entities.add({id:`country-${id}_${i}`,name:feature.properties.name||id,polygon:{hierarchy:new C.PolygonHierarchy(position(rings[0]),rings.slice(1).map(r=>new C.PolygonHierarchy(position(r)))),height:2,material:C.Color.TRANSPARENT,outline:false}});
      const borderColor=C.Color.fromCssColorString(country?({available:'#177c68',trial:'#966310',emergency:'#a74030'}[country.status]||'#476070'):'#476070');
      rings.forEach((ring,index)=>countryLayer.entities.add({id:`country-${id}_${i}_border_${index}`,polyline:{positions:position(ring),width:country?1.6:1,material:borderColor.withAlpha(country ? 0.85 : 0.45),arcType:C.ArcType.GEODESIC}}));
    }
  }
  for(const country of state.countries){countryLayer.entities.add({id:`country-${country.id}_label`,position:C.Cartesian3.fromDegrees(country.lon,country.lat,8000),point:{color:countryColor(country).withAlpha(.7),pixelSize:3},label:{text:country.name,font:'11px sans-serif',fillColor:countryColor(country).withAlpha(.9),outlineColor:C.Color.fromCssColorString('#06111a'),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-13),distanceDisplayCondition:new C.DistanceDisplayCondition(0,9000000)}});}
  highlightCountries();viewer.scene.requestRender();
}
function countryColor(country) {return C.Color.fromCssColorString({available:'#72cbb4',commercial:'#72cbb4',trial:'#dbb971',announced:'#dbb971',coming:'#dbb971',emergency:'#db8c76',unknown:'#758c9e',filing:'#758c9e'}[country.status]||'#758c9e');}
function ringContains(lon,lat,ring) {
  const xs=[];let prev=ring[0][0];for(const p of ring){let x=p[0];while(x-prev>180)x-=360;while(x-prev< -180)x+=360;xs.push(x);prev=x;}
  const x=lon+360*Math.round((xs.reduce((a,b)=>a+b,0)/xs.length-lon)/360);let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){const yi=ring[i][1],yj=ring[j][1];if((yi>lat)!==(yj>lat)&&x<(xs[j]-xs[i])*(lat-yi)/(yj-yi)+xs[i])inside=!inside;}return inside;
}
function countryAt(lat,lon) {
  for(const feature of countryFeatures){const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;if(polygons.some(rings=>ringContains(lon,lat,rings[0])&&!rings.slice(1).some(ring=>ringContains(lon,lat,ring))))return feature.id||feature.properties.id;}return null;
}
function highlightCountries() {if(!countryLayer)return;countryLayer.show=true;for(const e of countryLayer.entities.values){if(!e.polygon)continue;const c=state.countries.find(x=>e.id.startsWith(`country-${x.id}_`));if(c)e.polygon.material=countryColor(c).withAlpha(c.id===state.countryId ? .075 : 0);}viewer.scene.requestRender();}

function refreshTac(focus) {
  if(!state.tacReady||!tacLayer||!tacOutlines)return;
  tacLayer.show=tacOutlines.show=$('layer-tac').checked;
  viewer.scene.requestRender();
  if(!$('layer-tac').checked)return;
  const center=focus||{lat:state.lat,lon:state.lon},entry=state.countryTacs[state.tacCountryId];
  const scope=entry?`country:${state.tacCountryId}`:`local:${center.lat.toFixed(1)},${center.lon.toFixed(1)}`;
  const key=`${scope},${state.tacId},${state.basemap}`;
  if(key===lastTacFocus)return;lastTacFocus=key;tacLayer.entities.removeAll();tacOutlines.removeAll();
  const ids=new Set(entry?entry.ids:nearbyTacs(center.lat,center.lon,1400,450));
  if(state.tacId!=null){ids.add(state.tacId);if(!entry)tacNeighbors(state.tacId).forEach(id=>ids.add(id));}
  const neighbors=new Set(state.tacId==null?[]:tacNeighbors(state.tacId));
  const lineColor=state.basemap==='osm'?C.Color.fromCssColorString('#9b5613'):colors.amber;
  const instances=[];
  tacLayer.entities.suspendEvents();
  for(const id of ids){const ring=tacBoundary(id);if(ring.length<3)continue;const selected=id===state.tacId;const nearby=neighbors.has(id);
    const surface=C.Cartesian3.fromDegreesArrayHeights(ring.flatMap(p=>[p[0],p[1],15]));
    instances.push(new C.GeometryInstance({id:{id:`tac-${id}`},geometry:new C.PolylineGeometry({positions:[...surface,surface[0]],width:selected?2:1.1,vertexFormat:C.PolylineColorAppearance.VERTEX_FORMAT}),attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(lineColor.withAlpha(selected?1:nearby?.85:entry?.64:.32))}}));
    if(selected||nearby)tacLayer.entities.add({id:`tac-${id}`,polygon:{hierarchy:C.Cartesian3.fromDegreesArrayHeights(ring.flatMap(p=>[p[0],p[1],10])),perPositionHeight:true,material:colors.amber.withAlpha(selected?.18:.035)},...(selected?{position:C.Cartesian3.fromDegrees(tacCenter(id).lon,tacCenter(id).lat,50),label:{text:`TAC ${id}`,font:'11px sans-serif',fillColor:colors.amber,outlineColor:C.Color.BLACK,outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,distanceDisplayCondition:new C.DistanceDisplayCondition(0,4000000)}}:{})});
  }
  if(instances.length)tacOutlines.add(new C.Primitive({geometryInstances:instances,appearance:new C.PolylineColorAppearance({translucent:true}),asynchronous:true}));
  tacLayer.entities.resumeEvents();tacLayer.show=tacOutlines.show=$('layer-tac').checked;
  const country=state.countries.find(c=>c.id===state.tacCountryId);
  $('tac-scope-label').textContent=entry?`Full country · ${entry.count.toLocaleString('en-US')} cells`:'Research model · Local grid';
  $('tac-status').textContent=entry?`${country?.name} · ${entry.count.toLocaleString('en-US')} TAC cells`:'65,536 candidate TAC cells';
  viewer.scene.requestRender();
}

function installOrbits(data) {
  if(!data?.satellites?.length)throw new Error('The orbit catalog is empty.');
  state.orbitData=data;pointCollection.removeAll();
  state.satellites=data.satellites.map(s=>{
    try{const satrec=window.satellite.twoline2satrec(s.line1,s.line2);return {...s,satrec,point:pointCollection.add({id:{kind:'satellite',noradId:s.noradId},position:new C.Cartesian3(),pixelSize:3.8,color:satelliteColor(satrec).withAlpha(.8),outlineColor:C.Color.fromCssColorString('#102a3c'),outlineWidth:1,scaleByDistance:new C.NearFarScalar(1e6,1.25,3e7,.8)})};}catch{return null;}
  }).filter(Boolean);
  state.selectedSat=state.satellites.some(s=>s.noradId===state.selectedSat)?state.selectedSat:null;
  $('satellite-total').textContent=state.satellites.length;
  $('orbit-source').textContent=data.mirrored?'CelesTrak · Daily mirror':data.cached?'CelesTrak · Cached':'CelesTrak · Orbit catalog';
  $('orbit-source').title=data.source;
  $('orbit-freshness').textContent=`Latest epoch ${utc(data.epochMax).slice(5)}${data.staleCount?` · ${data.staleCount} older records`:''}`;
  $('source-dot').style.background=data.staleCount?'#dcb46b':'#63e7ef';
  lastOrbitAt=0;updatePositions();
}
function updatePositions() {
  if(!viewer||!state.satellites.length)return;
  const now=new Date(),satellite=window.satellite,gmst=satellite.gstime(now),observer={latitude:state.lat*Math.PI/180,longitude:state.lon*Math.PI/180,height:0};const visible=[];let invalid=0;
  for(const s of state.satellites){
    try{
      const pv=satellite.propagate(s.satrec,now);if(!pv?.position||!pv.velocity){s.point.show=false;s.geo=null;invalid++;continue;}
      const p=pv.position,g=satellite.eciToGeodetic(p,gmst),ecf=satellite.eciToEcf(p,gmst),look=satellite.ecfToLookAngles(observer,ecf);
      if(!Number.isFinite(g.height)||g.height<80||g.height>50000){s.point.show=false;s.geo=null;invalid++;continue;}
      s.geo={lat:g.latitude*180/Math.PI,lon:g.longitude*180/Math.PI,height:g.height,speed:Math.hypot(pv.velocity.x,pv.velocity.y,pv.velocity.z),range:look.rangeSat,azimuth:look.azimuth*180/Math.PI,elevation:look.elevation*180/Math.PI};
      s.point.position=new C.Cartesian3(ecf.x*1000,ecf.y*1000,ecf.z*1000);s.point.show=$('layer-satellites').checked;
      const selected=s.noradId===state.selectedSat;
      s.point.pixelSize=selected?8:s.geo.elevation>25?5.5:3.8;s.point.color=satelliteColor(s.satrec).withAlpha(selected?1:s.geo.elevation>0?.98:.68);s.point.outlineColor=selected?C.Color.WHITE:C.Color.fromCssColorString('#102a3c');s.point.outlineWidth=selected?2:1;
      if(s.geo.elevation>0)visible.push(s);
    }catch{s.point.show=false;s.geo=null;invalid++;}
  }
  if(!state.observerSelected)visible.length=0;
  visible.sort((a,b)=>b.geo.elevation-a.geo.elevation);
  if(state.selectedSat&&!state.satellites.find(s=>s.noradId===state.selectedSat)?.geo){state.selectedSat=null;lastOrbitAt=0;if(orbitEntity){viewer.entities.remove(orbitEntity);orbitEntity=null;}satelliteLabel.show=false;}
  if(!state.selectedSat&&visible.length)state.selectedSat=visible[0].noradId;
  if(!state.selectedSat)state.selectedSat=state.satellites.find(s=>s.geo)?.noradId;
  renderSky(state.satellites,state.observerSelected,state.selectedSat);
  $('visible-total').textContent=state.observerSelected?visible.length:'—';$('high-total').textContent=state.observerSelected?visible.filter(s=>s.geo.elevation>=25).length:'—';
  $('bottom-status').textContent=`Live orbit propagation${invalid?` · ${invalid} without a valid current position`:''}`;
  const candidates=visible.slice(0,5);const content=candidates.map((s,i)=>`<button class="candidate-row${s.noradId===state.selectedSat?' active':''}" data-satellite="${s.noradId}"><span class="rank">0${i+1}</span><span class="candidate-name">${esc(shortName(s.name))}</span><span class="elevation-track"><i style="width:${Math.max(1,s.geo.elevation/90*100)}%"></i></span><span class="elevation">${s.geo.elevation.toFixed(1)}°</span></button>`).join('')||'<div class="empty-state">No satellites above the horizon. Select an observer location to view visibility.</div>';
  if(content!==lastCandidates){$('candidate-list').innerHTML=content;lastCandidates=content;}
  const selected=state.satellites.find(s=>s.noradId===state.selectedSat);
  if(selected?.geo){satelliteLabel.position=selected.point.position;satelliteLabel.label.text=shortName(selected.name);satelliteLabel.show=$('layer-satellites').checked;
    if(state.orbitRequested&&Date.now()-lastOrbitAt>60000)drawOrbit(selected,now);
    if(orbitEntity)orbitEntity.show=state.orbitRequested&&$('layer-satellites').checked;
  }
  if(state.detail==='satellite')renderDetail();
  viewer.clock.currentTime=C.JulianDate.fromDate(now);viewer.scene.requestRender();
}
function drawOrbit(sat,now) {
  lastOrbitAt=Date.now();if(orbitEntity)viewer.entities.remove(orbitEntity);
  const duration=Math.min(130,2*Math.PI/sat.satrec.no),positions=[];
  for(let i=0;i<=180;i++){const date=new Date(+now+(i/180)*duration*60000);const pv=window.satellite.propagate(sat.satrec,date);if(!pv?.position)continue;const ecf=window.satellite.eciToEcf(pv.position,window.satellite.gstime(date));if(Number.isFinite(ecf.x))positions.push(new C.Cartesian3(ecf.x*1000,ecf.y*1000,ecf.z*1000));}
  orbitEntity=viewer.entities.add({id:'selected-orbit',show:$('layer-satellites').checked,polyline:{positions,width:1.4,material:satelliteColor(sat.satrec).withAlpha(.55)}});
}
async function refreshOrbits(manual=false) {
  const button=$('refresh-orbits');button.disabled=true;
  try {const data=await json('/api/orbits',25000);installOrbits(data);if(manual)toast(data.cached?'Cached orbital elements loaded; refreshed on the source schedule.':'Orbital elements refreshed.');}
  catch(error){if(!state.orbitData){try{installOrbits(await json('/data/orbits.json'));toast('Latest snapshot loaded; positions continue to update at the current time.');}catch{toast('Orbit data is unavailable. Please try again later.');}}else if(manual)toast('The source is unavailable; using the latest orbital elements.');}
  finally{button.disabled=false;}
}

function renderNews() {
  const q=$('news-search').value.trim().toLowerCase();
  const items=state.news.filter(item=>item.type==='research'&&item.thesisReference&&(!q||`${item.title} ${item.summary} ${item.source} ${item.operatorTags?.join(' ')}`.toLowerCase().includes(q))).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))||(a.featuredRank??999)-(b.featuredRank??999));
  $('news-grid').innerHTML=items.length?items.map(item=>`<article class="news-card"><div class="news-card-top"><span class="${item.type==='research'?'amber':'cyan'}">${typeText[item.type]||'Updates'}</span><time datetime="${esc(item.publishedAt)}">${esc(item.publishedAt?.slice(0,10)||'Date unknown')}</time></div><h2><a href="${safeUrl(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a></h2>${item.topic?`<div class="research-topic">${esc(item.topic)}</div>`:''}<p>${esc(item.summary||'Read the original source for full details.')}</p><div class="news-card-bottom"><span>${esc(item.source)}</span><a href="${safeUrl(item.url)}" target="_blank" rel="noopener">Read source ↗</a></div></article>`).join(''):'<div class="empty-state">No research matches your search. Try another term.</div>';
}
async function refreshNews(manual=false) {
  $('refresh-news').disabled=true;
  if(manual)$('news-status').textContent='Loading selected research…';
  try {
    const data=await json('/api/news',10000);
    state.news=(data.items||[]).filter(item=>item.type==='research'&&item.thesisReference);
  } catch {
    const data=await json('/data/news.json');
    state.news=(data.items||[]).filter(item=>item.type==='research'&&item.thesisReference);
  } finally {$('refresh-news').disabled=false;}
  $('news-status').textContent=`${state.news.length} selected studies`;
  renderNews();
}

function setupEvents() {
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>setDetail(b.dataset.detail)));
  document.body.addEventListener('click',event=>{
    const country=event.target.closest('[data-country]');if(country){
      const id=country.dataset.country;
      if(state.countryId===id&&state.tacCountryId===id){
        const c=currentCountry();
        if(state.locationName===c?.name)clearObserver();
        state.countryId=null;state.tacCountryId=null;state.tacId=null;hideTacGrid();
        renderCountryList();highlightCountries();refreshTac();renderDetail();
      }else selectCountry(id);
      return;
    }
    const sat=event.target.closest('[data-satellite]');if(sat){selectSatellite(sat.dataset.satellite);return;}
    const tac=event.target.closest('[data-tac]');if(tac){selectTac(Number(tac.dataset.tac),true);return;}
    if(event.target.closest('#focus-satellite'))selectSatellite(state.selectedSat,true);
    if(event.target.closest('#fit-country'))selectCountry(state.countryId);
  });
  $('country-search').addEventListener('input',renderCountryList);$('news-search').addEventListener('input',renderNews);
  $('global-search').addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;const query=event.target.value.trim();if(!query)return;
    if(/^tac\s*\d+$/i.test(query)){state.tacCountryId=null;selectTac(Number(query.replace(/tac\s*/i,'')),true);return;}
    const sat=state.satellites.find(s=>String(s.noradId)===query||shortName(s.name).toLowerCase()===query.toLowerCase()||shortName(s.name).replace('STARLINK-','')===query);
    if(sat){selectSatellite(sat.noradId,true);return;}
    const country=state.countries.find(c=>[c.name,c.nameEn,c.id].some(n=>n.toLowerCase()===query.toLowerCase()));if(country){selectCountry(country.id);return;}
    if(/^\d+$/.test(query)){state.tacCountryId=null;selectTac(Number(query),true);return;}toast('No match found. Enter a satellite ID or TAC 55647.');
  });
  $('layer-satellites').addEventListener('change',updatePositions);
  $('layer-tac').addEventListener('change',()=>{if($('layer-tac').checked)refreshTac();if(tacLayer)tacLayer.show=$('layer-tac').checked;if(tacOutlines)tacOutlines.show=$('layer-tac').checked;viewer.scene.requestRender();});
  $('view-3d').addEventListener('click',()=>setView('3d'));$('view-2d').addEventListener('click',()=>setView('2d'));
  $('zoom-in').addEventListener('click',()=>{viewer.camera.zoomIn(viewer.camera.positionCartographic.height*.35);viewer.scene.requestRender();});
  $('zoom-out').addEventListener('click',()=>{viewer.camera.zoomOut(viewer.camera.positionCartographic.height*.5);viewer.scene.requestRender();});
  $('reset-view').addEventListener('click',()=>globalView());$('location-focus').addEventListener('click',()=>{if(viewer){viewer.scene.completeMorph();viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(state.lon,state.lat,120000),duration:1.4});}});
  $('location-form').addEventListener('submit',event=>{event.preventDefault();try{const point=parseObserverCoordinates($('observer-lat').value,$('observer-lon').value);if(!viewer){toast('The map is still loading. Apply the coordinates when it is ready.');return;}setObserver(point.lat,point.lon,'Custom coordinates');viewer.scene.completeMorph();viewer.camera.flyTo({destination:C.Cartesian3.fromDegrees(point.lon,point.lat,120000),duration:1.4});toast(`Observer updated: ${formatCoords(point.lat,point.lon,4)}`);}catch(error){$('coordinate-error').textContent=error.message;$('coordinate-error').hidden=false;}});
  $('refresh-orbits').addEventListener('click',()=>refreshOrbits(true));$('refresh-news').addEventListener('click',()=>refreshNews(true));
  for(const id of ['about-button','data-info-button'])$(id).addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
  $('about-dialog').addEventListener('click',event=>{if(event.target===$('about-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
}
function clockTick() {const now=new Date();$('utc-clock').textContent=now.toISOString().slice(11,19);$('utc-date').textContent=now.toISOString().slice(0,10);if(!document.hidden&&tickCount++%1===0)updatePositions();}
async function init() {
  setupEvents();
  for(const id of ['observer-lat','observer-lon'])$(id).addEventListener('input',()=>{
    if(!$('observer-lat').value.trim()||!$('observer-lon').value.trim()){
      state.observerSelected=false;if(observerEntity)observerEntity.show=false;
      $('location-name').textContent='No location selected';renderSky([],false,null);updatePositions();
    }
  });
  clockTick();setInterval(clockTick,1000);
  try {
    const deadline=Date.now()+20000;while((!window.Cesium||!window.satellite)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!window.Cesium||!window.satellite)throw new Error('Map components failed to load. Check the connection and reload.');
    const [countries,countryTacs]=await Promise.all([json('/data/countries.json'),json('/data/country-tacs.json')]);state.countries=countries;state.countryTacs=countryTacs.countries;renderCountryList();
    json('/data/spectrum-review.json').then(review=>{state.additionalPartners=review.additionalPartners||[];renderCountryList();if(state.detail==='country')renderDetail();}).catch(error=>console.warn('Supplemental partnership evidence unavailable',error));
    await createGlobe();state.tacId=nearestTac(state.lat,state.lon);
    const startSnapshot=await json('/data/orbits.json');installOrbits(startSnapshot);$('globe-loading').hidden=true;
    addCountries().catch(e=>{console.warn(e);toast('The country layer could not load. Spectrum records are still available.');});
    loadTacModel().then(()=>{state.tacReady=true;refreshTac();if(state.detail==='tac')renderDetail();}).catch(e=>{console.warn(e);$('layer-tac').checked=false;$('tac-status').textContent='TAC boundaries unavailable';toast('TAC boundaries could not load. Center lookup is still available.');});
    json('/data/news.json').then(data=>{state.news=data.items;renderNews();}).catch(console.warn);
    refreshOrbits();refreshNews();setInterval(refreshOrbits,7200000);setInterval(refreshNews,900000);
    window.addEventListener('resize',()=>{viewer.resize();viewer.scene.requestRender();});
    window.DTC_DEMO={state,viewer,selectCountry,selectSatellite,selectTac,setObserver,setView};
  } catch(error){console.error(error);$('globe-loading').innerHTML=`<strong>The map could not load</strong><span>${esc(error.message)}</span><button class="outline-button" onclick="location.reload()">Reload</button>`;}
}
init();
