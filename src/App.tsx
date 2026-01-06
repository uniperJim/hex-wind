import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { REGIONS, WIND_COLORS, RegionConfig, Turbine } from './types';
import { synthesizeTurbineData, getTotalStats, fetchRealTurbineData } from './dataService';
import { aggregateHexagons, turbinesToGeoJSON, generateH3Indices, getMaxMW } from './h3Utils';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading wind turbine data...');
  const [region, setRegion] = useState<RegionConfig>(REGIONS[0]);
  const [stats, setStats] = useState({ count: 0, totalMW: 0 });
  const [useRealData, setUseRealData] = useState(true);
  const [dataSource, setDataSource] = useState('Synthesized data');

  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: region.center,
      zoom: region.zoom,
      pitch: 40,
      bearing: 0,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      loadRegionData(region, useRealData);
    });
  }, []);

  const loadRegionData = useCallback(async (selectedRegion: RegionConfig, fetchReal: boolean) => {
    setLoading(true);
    setLoadingMessage('Loading wind turbine data...');
    
    try {
      let turbines: Turbine[];
      
      if (fetchReal) {
        turbines = await fetchRealTurbineData(selectedRegion, (msg) => {
          setLoadingMessage(msg);
        });
        setDataSource('Open Power System Data (OPSD)');
      } else {
        turbines = synthesizeTurbineData(selectedRegion);
        setDataSource('Synthesized data');
      }
      
      const turbineStats = getTotalStats(turbines);
      setStats(turbineStats);

      const hexagons = aggregateHexagons(turbines, [3, 4, 5, 6]);
      const turbineGeoJSON = turbinesToGeoJSON(turbines);

      if (map.current) {
        // Remove existing layers and sources
        const layersToRemove = [
          'hex-res3', 'hex-res4', 'hex-res5', 'hex-res6',
          'turbine-glow', 'turbine-points'
        ];
        const sourcesToRemove = [
          'hex-res3', 'hex-res4', 'hex-res5', 'hex-res6', 'turbines'
        ];

        for (const layer of layersToRemove) {
          if (map.current.getLayer(layer)) {
            map.current.removeLayer(layer);
          }
        }
        for (const source of sourcesToRemove) {
          if (map.current.getSource(source)) {
            map.current.removeSource(source);
          }
        }

        // Add hexagon sources and layers
        addHexagonLayers(map.current, hexagons, turbines);
        
        // Add turbine points
        addTurbineLayer(map.current, turbineGeoJSON);

        // Fly to region
        map.current.flyTo({
          center: selectedRegion.center,
          zoom: selectedRegion.zoom,
          duration: 1500,
        });
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadingMessage('Error loading data. Please try again.');
      setLoading(false);
    }
  }, []);

  const addHexagonLayers = (
    mapInstance: maplibregl.Map,
    hexagons: Map<number, GeoJSON.FeatureCollection<GeoJSON.Polygon>>,
    turbines: Turbine[]
  ) => {
    const resConfigs = [
      { res: 3, minZoom: 0, maxZoom: 6, fadeIn: [0, 4.5], fadeOut: [4.5, 5.5] },
      { res: 4, minZoom: 4.5, maxZoom: 8, fadeIn: [4.5, 5.5], fadeOut: [6.5, 7.5] },
      { res: 5, minZoom: 6.5, maxZoom: 10, fadeIn: [6.5, 7.5], fadeOut: [8.5, 9.5] },
      { res: 6, minZoom: 8.5, maxZoom: 12, fadeIn: [8.5, 9.5], fadeOut: [10.5, 11.5] },
    ];

    for (const config of resConfigs) {
      const data = hexagons.get(config.res);
      if (!data) continue;

      const hexMap = generateH3Indices(turbines, config.res);
      const maxMW = getMaxMW(hexMap);

      const sourceId = `hex-res${config.res}`;
      
      mapInstance.addSource(sourceId, {
        type: 'geojson',
        data,
      });

      mapInstance.addLayer({
        id: sourceId,
        type: 'fill',
        source: sourceId,
        minzoom: config.minZoom,
        maxzoom: config.maxZoom,
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'total_mw'],
            0, WIND_COLORS[0],
            maxMW * 0.05, WIND_COLORS[1],
            maxMW * 0.15, WIND_COLORS[2],
            maxMW * 0.35, WIND_COLORS[3],
            maxMW * 0.6, WIND_COLORS[4],
            maxMW, WIND_COLORS[5],
          ],
          'fill-opacity': [
            'interpolate',
            ['exponential', 1.5],
            ['zoom'],
            config.fadeIn[0], 0,
            config.fadeIn[1], 0.85,
            config.fadeOut[0], 0.85,
            config.fadeOut[1], 0,
          ],
          'fill-outline-color': 'rgba(8, 64, 129, 0.3)',
        },
      });

      // Add hover popup for hexagons
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      mapInstance.on('mousemove', sourceId, (e) => {
        if (e.features && e.features.length > 0) {
          mapInstance.getCanvas().style.cursor = 'pointer';
          const feature = e.features[0];
          const props = feature.properties || {};
          
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 8px 12px; font-family: -apple-system, sans-serif;">
                <strong>${props.turbine_count?.toLocaleString() || 0}</strong> turbines<br>
                <strong>${props.total_mw?.toLocaleString() || 0}</strong> MW
              </div>
            `)
            .addTo(mapInstance);
        }
      });

      mapInstance.on('mouseleave', sourceId, () => {
        mapInstance.getCanvas().style.cursor = '';
        popup.remove();
      });
    }
  };

  const addTurbineLayer = (
    mapInstance: maplibregl.Map,
    turbineGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point>
  ) => {
    mapInstance.addSource('turbines', {
      type: 'geojson',
      data: turbineGeoJSON,
    });

    // Glow layer
    mapInstance.addLayer({
      id: 'turbine-glow',
      type: 'circle',
      source: 'turbines',
      minzoom: 9,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          9, 6,
          12, 12,
          16, 20,
        ],
        'circle-color': '#0868ac',
        'circle-blur': 1,
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          9, 0,
          10.5, 0.15,
          12, 0.25,
        ],
      },
    });

    // Points layer
    mapInstance.addLayer({
      id: 'turbine-points',
      type: 'circle',
      source: 'turbines',
      minzoom: 9,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          9, 3,
          12, 6,
          16, 12,
        ],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'capacity_mw'],
          0, '#a8ddb5',
          2, '#4eb3d3',
          4, '#2b8cbe',
          8, '#0868ac',
          13, '#084081',
        ],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          9, 0,
          10.5, 0.85,
          12, 1,
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 1,
          14, 2,
        ],
        'circle-stroke-opacity': [
          'interpolate', ['linear'], ['zoom'],
          9, 0,
          11, 0.7,
          13, 1,
        ],
      },
    });

    // Click popup for turbine points
    mapInstance.on('click', 'turbine-points', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties || {};
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

        new maplibregl.Popup()
          .setLngLat(coordinates)
          .setHTML(`
            <div class="turbine-popup">
              <div class="popup-label">Wind Turbine</div>
              <div class="popup-title">${props.project || 'Unknown Project'}</div>
              <div class="popup-grid">
                <div>
                  <div class="popup-item-label">Capacity</div>
                  <div class="popup-item-value highlight">${props.capacity_mw} MW</div>
                </div>
                <div>
                  <div class="popup-item-label">Year</div>
                  <div class="popup-item-value">${props.year || 'N/A'}</div>
                </div>
                <div>
                  <div class="popup-item-label">Manufacturer</div>
                  <div class="popup-item-value">${props.manufacturer || 'N/A'}</div>
                </div>
                <div>
                  <div class="popup-item-label">Model</div>
                  <div class="popup-item-value">${props.model || 'N/A'}</div>
                </div>
                <div>
                  <div class="popup-item-label">Hub Height</div>
                  <div class="popup-item-value">${props.hub_height || 'N/A'} m</div>
                </div>
                <div>
                  <div class="popup-item-label">Rotor Diameter</div>
                  <div class="popup-item-value">${props.rotor_dia || 'N/A'} m</div>
                </div>
              </div>
            </div>
          `)
          .addTo(mapInstance);
      }
    });

    mapInstance.on('mouseenter', 'turbine-points', () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    });

    mapInstance.on('mouseleave', 'turbine-points', () => {
      mapInstance.getCanvas().style.cursor = '';
    });
  };

  useEffect(() => {
    initializeMap();
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [initializeMap]);

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedRegion = REGIONS.find((r) => r.id === e.target.value);
    if (selectedRegion) {
      setRegion(selectedRegion);
      loadRegionData(selectedRegion, useRealData);
    }
  };

  const handleDataSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUseRealData = e.target.checked;
    setUseRealData(newUseRealData);
    loadRegionData(region, newUseRealData);
  };

  return (
    <div className="map-container">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">{loadingMessage}</div>
        </div>
      )}

      <div className="info-panel">
        <div className="info-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" 
            fill="none" stroke="#0868ac" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 11m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
            <path d="M10 11v-2.573c0 -.18 .013 -.358 .04 -.536l.716 -4.828c.064 -.597 .597 -1.063 1.244 -1.063s1.18 .466 1.244 1.063l.716 4.828c.027 .178 .04 .357 .04 .536v2.573" />
            <path d="M13.01 9.28l2.235 1.276c.156 .09 .305 .19 .446 .3l3.836 2.911c.487 .352 .624 1.04 .3 1.596c-.325 .556 -1 .782 -1.548 .541l-4.555 -1.68a3.624 3.624 0 0 1 -.486 -.231l-2.235 -1.277" />
            <path d="M13 12.716l-2.236 1.277a3.624 3.624 0 0 1 -.485 .23l-4.555 1.681c-.551 .241 -1.223 .015 -1.548 -.54c-.324 -.557 -.187 -1.245 .3 -1.597l3.836 -2.91a3.41 3.41 0 0 1 .446 -.3l2.235 -1.277" />
            <path d="M7 21h10" /><path d="M10 21l1 -7" /><path d="M13 14l1 7" />
          </svg>
          <div>
            <div className="info-title">{region.name} Wind Energy</div>
            <div className="info-subtitle">
              {stats.count.toLocaleString()} turbines | {Math.round(stats.totalMW / 1000)} GW capacity
            </div>
          </div>
        </div>
        <div className="info-description">
          Hexagons show total MW capacity per area. Zoom in to explore individual turbines.
        </div>
        <div className="info-source">
          Data: <a href="https://data.open-power-system-data.org/renewable_power_plants/" target="_blank" rel="noopener noreferrer">{dataSource}</a>
        </div>
      </div>

      <div className="region-selector">
        <label htmlFor="region-select">Region:</label>
        <select id="region-select" value={region.id} onChange={handleRegionChange}>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <label htmlFor="use-real-data" className="data-toggle">
          <input
            id="use-real-data"
            name="use-real-data"
            type="checkbox"
            checked={useRealData}
            onChange={handleDataSourceChange}
          />
          <span>Use Real Data</span>
        </label>
      </div>

      <div className="legend">
        <div className="legend-title">Installed Capacity (MW)</div>
        <div 
          className="legend-gradient" 
          style={{
            background: `linear-gradient(to right, ${WIND_COLORS.join(', ')})`,
          }}
        />
        <div className="legend-labels">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

export default App;
