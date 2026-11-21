# Starlink D2C Observatory

An interactive research platform for exploring Starlink Direct-to-Cell satellites, sky visibility, TAC models, and partner spectrum data.

![Starlink D2C Observatory](docs/images/observatory.png)

## Features & Usage

| Feature | Usage |
| --- | --- |
| 2D&nbsp;/&nbsp;3D&nbsp;Map | Switch views, rotate, and zoom to explore the constellation. Blue dots indicate 43° orbits; purple dots indicate 53° orbits. |
| Satellite&nbsp;Tracking | Click a satellite to display its orbit and parameters; click it again to deselect. Positions are updated every second using SGP4. |
| Observer&nbsp;Location | Enter coordinates or select a location on the globe. Click the Observer marker again to clear it and its local TAC grid without switching off the TAC layer. |
| Live&nbsp;Sky&nbsp;View | View satellites above the selected location's horizon. Click a dot for satellite details. The plot stays empty until a location is selected. |
| TAC&nbsp;Model | Search a TAC ID or select a country to view its model grid. Click the selected country again to hide all TAC cells. This is a research model, not confirmed live beam coverage. |
| Countries&nbsp;&amp;&nbsp;Spectrum | Search countries, operators, or bands to view service stages, frequency pairs, LTE bands, and PLMNs. |
| Opensignal&nbsp;D2D | The observed-grid layer is enabled by default and can be toggled in 2D or 3D. The dated snapshot includes all reported D2D networks; operator identities and live coverage are unavailable. |
| Research | Browse selected studies by publication date, search by keyword, and open original sources. |

## License & Credits

Project code is licensed under the [MIT License](LICENSE). Third-party components and data retain their respective licenses and terms.

- **CesiumJS 1.123.1**: [Apache-2.0](public/vendor/cesium-LICENSE.md); retain notices in the bundled code. **satellite.js 6.0.1**: [MIT](public/vendor/satellite-LICENSE.md).
- **OpenStreetMap**: online tiles, not bundled. Preserve [contributor attribution](https://www.openstreetmap.org/copyright) and follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- **Natural Earth**: public-domain boundaries; see [country boundary sources](public/data/country-boundaries-source.json) and [world sources](public/data/world-source.json).
- **CelesTrak / public TLE mirror**: dated orbit snapshots with [source metadata](public/data/orbits.json), not guaranteed current data.
- Linked publications remain the property of their respective rights holders; this project's license does not authorize redistribution of their full texts.

- **Opensignal D2D**: [original map](https://d2d.opensignal.com/). Contains 373,703 geohash-6 observation cells without operator fields. Source data remains subject to Opensignal terms and is not covered by this project’s MIT license.
