// Opensignal D2D v1: precision byte, UTF-8 date, count, delta-varint geohashes.
export function decodeD2D(buffer) {
  const bytes = new Uint8Array(buffer); let offset = 5;
  const fail = () => { throw new Error('Invalid Opensignal D2D data'); };
  if ([68,50,68,1,6].some((v,i)=>bytes[i]!==v)) fail();
  function uint() {
    let value=0;
    for(let scale=1;scale<=2**28;scale*=128) {
      if(offset>=bytes.length) fail();
      const b=bytes[offset++];value+=(b&127)*scale;
      if(b<128)return value;
    }
    fail();
  }
  const length=uint();if(offset+length>bytes.length)fail();
  const date=new TextDecoder().decode(bytes.subarray(offset,offset+length));offset+=length;
  const count=uint();if(count>bytes.length-offset)fail();
  const cells=new Uint32Array(count);let value=0;
  for(let i=0;i<count;i++){const delta=uint();if(i&&!delta)fail();value+=delta;if(value>=2**30)fail();cells[i]=value;}
  if(offset!==bytes.length)fail();
  return {date,cells};
}
export function cellBounds(hash) {
  let x=0,y=0;
  for(let bit=0;bit<15;bit++){x+=((hash>>>(bit*2+1))&1)*2**bit;y+=((hash>>>(bit*2))&1)*2**bit;}
  return {west:x*360/32768-180,south:y*180/32768-90,east:(x+1)*360/32768-180,north:(y+1)*180/32768-90};
}

// Raster imagery keeps hundreds of thousands of cells out of Cesium's entity loop.
export function createD2DProvider(C, data) {
  const buckets=new Map();
  for(const hash of data.cells){const b=cellBounds(hash),key=Math.floor((b.west+180)/5)+72*Math.floor((b.south+90)/5);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}
  const scheme=new C.GeographicTilingScheme();
  return {
    tileWidth:256,tileHeight:256,minimumLevel:0,maximumLevel:14,
    tilingScheme:scheme,rectangle:scheme.rectangle,errorEvent:new C.Event(),
    credit:new C.Credit('<a href="https://d2d.opensignal.com/" target="_blank" rel="noopener">D2D observations © Opensignal</a>',true),
    hasAlphaChannel:true,getTileCredits(){return undefined;},pickFeatures(){return undefined;},
    requestImage(x,y,level){
      const tile=scheme.tileXYToRectangle(x,y,level),deg=C.Math.toDegrees;
      const west=deg(tile.west),east=deg(tile.east),south=deg(tile.south),north=deg(tile.north);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(255,106,145,0.8)';
      for(let by=Math.max(0,Math.floor((south+90-180/32768)/5));by<=Math.min(35,Math.floor((north+90)/5));by++) {
        for(let bx=Math.max(0,Math.floor((west+180-360/32768)/5));bx<=Math.min(71,Math.floor((east+180)/5));bx++) {
          for(const b of buckets.get(bx+72*by)||[]){
            if(b.east<=west||b.west>=east||b.north<=south||b.south>=north)continue;
            ctx.fillRect((b.west-west)/(east-west)*256,(north-b.north)/(north-south)*256,Math.max(1,(b.east-b.west)/(east-west)*256),Math.max(1,(b.north-b.south)/(north-south)*256));
          }
        }
      }
      return Promise.resolve(canvas);
    }
  };
}
export function attachD2DLayer(C,viewer,checkbox,status) {
  let layer,loading;
  const syncLayer=async()=>{
    if(layer){layer.show=checkbox.checked;viewer.scene.requestRender();return;}
    if(!checkbox.checked||loading)return;
    status.hidden=false;status.textContent='Loading observations…';
    loading=(async()=>{
      const response=await fetch('/data/d2d-data.314191eadb65.bin');
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=decodeD2D(await response.arrayBuffer());
      layer=viewer.imageryLayers.addImageryProvider(createD2DProvider(C,data));
      layer.show=checkbox.checked;
      status.textContent='';status.hidden=true;
      viewer.scene.requestRender();
    })();
    try{await loading;}catch(error){console.error(error);checkbox.checked=false;status.hidden=false;status.textContent='Unable to load · toggle to retry';}finally{loading=null;}
  };
  checkbox.addEventListener('change',syncLayer);
  if(checkbox.checked)void syncLayer();
}
