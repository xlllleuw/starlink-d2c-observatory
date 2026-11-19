/** Validate the observer form without accepting empty strings as zero. */
export function parseObserverCoordinates(latitude, longitude) {
  const fields = [{value:latitude,name:'Latitude',limit:90},{value:longitude,name:'Longitude',limit:180}];
  const values = fields.map(({value,name,limit}) => {
    if (String(value ?? '').trim() === '') throw new Error(`Enter a value for ${name.toLowerCase()}.`);
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit) throw new Error(`${name} must be between −${limit}° and ${limit}°.`);
    return number;
  });
  return {lat:values[0],lon:values[1]};
}
