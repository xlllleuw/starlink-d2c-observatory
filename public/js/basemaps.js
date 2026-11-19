/** Browser-only imagery requests preserve ordinary HTTP caching and attribution. */
export function createBasemapController(C, viewer, {onError=()=>{},onChange=()=>{}}={}) {
  const layers = new Map();
  let activeId = null;
  let osmErrors = 0;
  let requestId = 0;
  async function ensureLayer(id) {
    if (layers.has(id)) return layers.get(id);
    const provider = new C.OpenStreetMapImageryProvider({
          url:'https://tile.openstreetmap.org/',maximumLevel:19,
          credit:new C.Credit('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',true),
        });
    const layer=viewer.imageryLayers.addImageryProvider(provider);
    layer.show=false;
    layer.brightness=.92;layer.saturation=.85;
    layers.set(id,layer);
    if (id === 'osm') provider.errorEvent.addEventListener(error=>{
      if (activeId!=='osm') return;
      osmErrors++;
      if (osmErrors===3) onError('Some map tiles are unavailable. Check the connection or reload later.');
      // Cesium retains the lower-level loaded imagery. Do not hammer the public tile service.
      error.retry=false;
    });
    return layer;
  }
  async function set(id) {
    if (id !== 'osm') return;
    const request=++requestId;
    try {
      const layer=await ensureLayer(id);if(request!==requestId)return;
      for(const [key,item] of layers)item.show=key===id;
      viewer.imageryLayers.raiseToTop(layer);
      activeId=id;osmErrors=0;onChange(id);
      viewer.scene.requestRender();
    } catch(error) {
      if(request!==requestId)return;
      onError('The online map is unavailable. Check the connection and reload.');
      viewer.scene.requestRender();console.warn('Basemap unavailable',error);
    }
  }
  return {set,get activeId(){return activeId;}};
}
