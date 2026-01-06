import Papa from 'papaparse';
import { Turbine, RegionConfig } from './types';

// Real data sources from Open Power System Data (OPSD)
// https://data.open-power-system-data.org/renewable_power_plants/
const OPSD_DATA_URLS: Record<string, string> = {
  // Note: Norway uses NVE ArcGIS REST API instead of OPSD
  germany: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_DE.csv',
  uk: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_UK.csv',
  eu: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_EU.csv',
  denmark: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_DK.csv',
  france: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_FR.csv',
  sweden: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_SE.csv',
  switzerland: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_CH.csv',
  czech: 'https://data.open-power-system-data.org/renewable_power_plants/2020-08-25/renewable_power_plants_CZ.csv',
  // US data from USGS Wind Turbine Database - available via direct download
  // Note: USGS data requires unzipping, so we fall back to synthetic data for US
  // us: 'https://eerscmap.usgs.gov/uswtdb/assets/data/uswtdbCSV.zip',
};

interface OPSDRecord {
  lon?: string;
  lat?: string;
  electrical_capacity?: string;
  technology?: string;
  energy_source_level_2?: string;
  manufacturer?: string;
  model?: string;
  site_name?: string;
  commissioning_date?: string;
  federal_state?: string;
  municipality?: string;
  hub_height?: string;
  rotor_diameter?: string;
  country?: string;
}

// Parse OPSD CSV data into our Turbine format
function parseOPSDData(csvText: string, filterWind: boolean = true): Turbine[] {
  const result = Papa.parse<OPSDRecord>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const turbines: Turbine[] = [];
  
  for (const row of result.data) {
    // Filter for wind turbines only
    if (filterWind) {
      const isWind = row.energy_source_level_2?.toLowerCase().includes('wind') ||
                     row.technology?.toLowerCase().includes('wind') ||
                     row.technology?.toLowerCase().includes('onshore') ||
                     row.technology?.toLowerCase().includes('offshore');
      if (!isWind) continue;
    }

    const lon = parseFloat(row.lon || '');
    const lat = parseFloat(row.lat || '');
    const capacity = parseFloat(row.electrical_capacity || '0');

    // Skip records without valid coordinates
    if (isNaN(lon) || isNaN(lat) || lon === 0 || lat === 0) continue;
    
    // Skip very small installations (< 0.1 MW)
    if (capacity < 0.1) continue;

    const year = row.commissioning_date ? 
      parseInt(row.commissioning_date.substring(0, 4)) : undefined;

    turbines.push({
      lon,
      lat,
      capacity_mw: Math.round(capacity * 100) / 100,
      manufacturer: row.manufacturer || 'Unknown',
      model: row.model || 'Unknown',
      project: row.site_name || row.municipality || 'Wind Farm',
      year: year && !isNaN(year) ? year : undefined,
      state: row.federal_state || row.country || row.municipality || 'Unknown',
      hub_height: row.hub_height ? parseFloat(row.hub_height) : undefined,
      rotor_dia: row.rotor_diameter ? parseFloat(row.rotor_diameter) : undefined,
    });
  }

  return turbines;
}

// NVE ArcGIS REST API for Norway wind power data
// https://nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer
const NVE_WIND_API = 'https://nve.geodataonline.no/arcgis/rest/services/Vindkraft2/MapServer/0/query';

interface NVEFeature {
  attributes: {
    OBJECTID: number;
    anleggNavn: string;
    fylkeNavn: string;
    kommune: string;
    effekt_MW_idrift: number;
    effekt_MW: number;
    antallTurbiner: number;
    forsteIdriftDato: number | null;
    status: string;
  };
  geometry: {
    x: number;
    y: number;
  };
}

// Convert UTM zone 33N (EPSG:25833) to WGS84 (EPSG:4326)
// Simplified conversion using Proj4 formulas
function utm33nToWgs84(x: number, y: number): { lon: number; lat: number } {
  // UTM zone 33N parameters
  const k0 = 0.9996; // Scale factor
  const e = 0.0818191908426; // Eccentricity of WGS84 ellipsoid
  const a = 6378137.0; // Semi-major axis
  const e1sq = 0.006739497;
  const centralMeridian = 15; // Zone 33 central meridian in degrees

  // Remove false easting and convert to meters from central meridian
  const x1 = x - 500000;
  const y1 = y;

  // Calculate footprint latitude
  const M = y1 / k0;
  const mu = M / (a * (1 - e * e / 4 - 3 * Math.pow(e, 4) / 64 - 5 * Math.pow(e, 6) / 256));
  
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 = mu + 
    (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
    (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
    (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) +
    (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e * e * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = e1sq * cosPhi1 * cosPhi1;
  const R1 = a * (1 - e * e) / Math.pow(1 - e * e * sinPhi1 * sinPhi1, 1.5);
  const D = x1 / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi1 / R1) * (
    D * D / 2 -
    (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e1sq) * Math.pow(D, 4) / 24 +
    (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e1sq - 3 * C1 * C1) * Math.pow(D, 6) / 720
  );

  const lon = centralMeridian + (
    D -
    (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
    (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e1sq + 24 * T1 * T1) * Math.pow(D, 5) / 120
  ) / cosPhi1 * (180 / Math.PI);

  return {
    lon,
    lat: lat * (180 / Math.PI)
  };
}

// Fetch Norway wind power data from NVE
async function fetchNorwayData(onProgress?: (message: string) => void): Promise<Turbine[]> {
  onProgress?.('Fetching Norway wind power data from NVE...');
  
  const queryParams = new URLSearchParams({
    where: "status = 'D'", // D = Drift (operational)
    outFields: 'OBJECTID,anleggNavn,fylkeNavn,kommune,effekt_MW_idrift,effekt_MW,antallTurbiner,forsteIdriftDato,status',
    returnGeometry: 'true',
    f: 'json',
    outSR: '25833', // Keep in UTM zone 33N, we'll convert
  });

  try {
    const response = await fetch(`${NVE_WIND_API}?${queryParams}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      onProgress?.('No features found in NVE data');
      return [];
    }

    onProgress?.(`Parsing ${data.features.length} wind farms from NVE...`);

    const turbines: Turbine[] = [];
    
    for (const feature of data.features as NVEFeature[]) {
      const attrs = feature.attributes;
      const geom = feature.geometry;

      if (!geom || geom.x === 0 || geom.y === 0) continue;

      const capacity = attrs.effekt_MW_idrift || attrs.effekt_MW || 0;
      if (capacity < 0.1) continue;

      // Convert UTM to WGS84
      const { lon, lat } = utm33nToWgs84(geom.x, geom.y);

      // Skip if coordinates are clearly out of Norway bounds
      if (lon < 4 || lon > 32 || lat < 57 || lat > 72) {
        console.warn('Skipping out-of-bounds point:', { lon, lat, name: attrs.anleggNavn });
        continue;
      }

      const year = attrs.forsteIdriftDato ? 
        new Date(attrs.forsteIdriftDato).getFullYear() : undefined;

      // For wind farms with multiple turbines, create individual turbine points
      const numTurbines = attrs.antallTurbiner || 1;
      const capacityPerTurbine = capacity / numTurbines;

      // Add slight randomization for farms with multiple turbines
      for (let i = 0; i < numTurbines; i++) {
        const offsetLon = numTurbines > 1 ? (Math.random() - 0.5) * 0.02 : 0;
        const offsetLat = numTurbines > 1 ? (Math.random() - 0.5) * 0.015 : 0;

        turbines.push({
          lon: lon + offsetLon,
          lat: lat + offsetLat,
          capacity_mw: Math.round(capacityPerTurbine * 100) / 100,
          manufacturer: 'Unknown', // NVE doesn't provide manufacturer data
          model: 'Unknown',
          project: attrs.anleggNavn || 'Wind Farm',
          year: year && !isNaN(year) ? year : undefined,
          state: attrs.fylkeNavn || attrs.kommune || 'Norway',
        });
      }
    }

    onProgress?.(`Loaded ${turbines.length.toLocaleString()} wind turbines from NVE`);
    return turbines;
  } catch (error) {
    console.error('Failed to fetch NVE data:', error);
    throw error;
  }
}

// Fetch real data from OPSD or NVE (Norway)
export async function fetchRealTurbineData(
  region: RegionConfig,
  onProgress?: (message: string) => void
): Promise<Turbine[]> {
  // Norway uses NVE ArcGIS REST API directly (no CORS issues)
  if (region.id === 'norway') {
    try {
      return await fetchNorwayData(onProgress);
    } catch (error) {
      console.error('Failed to fetch Norway data:', error);
      onProgress?.(`Failed to fetch Norway data: ${error}. Using synthetic data...`);
      return synthesizeTurbineData(region);
    }
  }

  const url = OPSD_DATA_URLS[region.id];
  
  if (!url) {
    onProgress?.(`No real data source for ${region.name}, using synthetic data...`);
    return synthesizeTurbineData(region);
  }

  try {
    onProgress?.(`Fetching real wind turbine data for ${region.name}...`);
    
    // Try multiple CORS proxies in case one fails
    const corsProxies = [
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    ];

    let csvText = '';
    let lastError: Error | null = null;

    for (const proxyFn of corsProxies) {
      try {
        const proxyUrl = proxyFn(url);
        onProgress?.(`Trying to fetch data...`);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        csvText = await response.text();
        if (csvText && csvText.length > 100) {
          break; // Success!
        }
      } catch (e) {
        lastError = e as Error;
        console.warn('CORS proxy failed:', e);
      }
    }

    if (!csvText || csvText.length < 100) {
      throw lastError || new Error('Failed to fetch data from all proxies');
    }

    onProgress?.('Parsing CSV data...');
    const turbines = parseOPSDData(csvText);
    
    if (turbines.length === 0) {
      onProgress?.(`No wind turbines found in ${region.name} data. Using synthetic data...`);
      console.warn('Parsed 0 turbines. First 500 chars of CSV:', csvText.substring(0, 500));
      return synthesizeTurbineData(region);
    }
    
    onProgress?.(`Loaded ${turbines.length.toLocaleString()} wind turbines`);
    return turbines;
  } catch (error) {
    console.error('Failed to fetch real data:', error);
    onProgress?.(`Failed to fetch data: ${error}. Using synthetic data...`);
    return synthesizeTurbineData(region);
  }
}

// Wind farm locations for realistic synthesis based on actual wind farm regions
const WIND_FARM_CLUSTERS: Record<string, Array<{ center: [number, number]; radius: number; count: number; name: string }>> = {
  us: [
    { center: [-101.5, 35.2], radius: 1.5, count: 3000, name: 'Texas Panhandle' },
    { center: [-97.5, 35.5], radius: 1.0, count: 2500, name: 'Oklahoma' },
    { center: [-99.5, 38.5], radius: 1.2, count: 2000, name: 'Kansas' },
    { center: [-97.0, 41.5], radius: 0.8, count: 1500, name: 'Nebraska' },
    { center: [-94.5, 42.5], radius: 1.0, count: 3500, name: 'Iowa' },
    { center: [-89.5, 41.0], radius: 0.6, count: 1200, name: 'Illinois' },
    { center: [-86.5, 41.0], radius: 0.5, count: 800, name: 'Indiana' },
    { center: [-120.5, 35.0], radius: 0.8, count: 1500, name: 'California Tehachapi' },
    { center: [-121.5, 38.0], radius: 0.6, count: 1000, name: 'California Altamont' },
    { center: [-104.5, 41.0], radius: 1.0, count: 2000, name: 'Wyoming' },
    { center: [-104.5, 39.5], radius: 0.8, count: 1800, name: 'Colorado' },
    { center: [-106.5, 34.5], radius: 0.7, count: 1200, name: 'New Mexico' },
    { center: [-119.5, 46.0], radius: 0.8, count: 1500, name: 'Washington' },
    { center: [-120.5, 45.0], radius: 0.6, count: 1000, name: 'Oregon' },
    { center: [-96.5, 46.5], radius: 0.8, count: 1200, name: 'North Dakota' },
    { center: [-100.0, 44.5], radius: 0.6, count: 800, name: 'South Dakota' },
    { center: [-94.0, 45.0], radius: 0.7, count: 1500, name: 'Minnesota' },
  ],
  norway: [
    { center: [9.0, 59.0], radius: 0.6, count: 400, name: 'Rogaland' },
    { center: [6.5, 62.0], radius: 0.5, count: 350, name: 'Møre og Romsdal' },
    { center: [10.5, 63.5], radius: 0.7, count: 500, name: 'Trøndelag' },
    { center: [12.0, 66.0], radius: 0.5, count: 300, name: 'Nordland' },
    { center: [18.5, 69.5], radius: 0.6, count: 250, name: 'Troms og Finnmark' },
  ],
  germany: [
    { center: [9.0, 54.5], radius: 0.8, count: 2500, name: 'Schleswig-Holstein' },
    { center: [9.5, 53.5], radius: 0.5, count: 1200, name: 'Hamburg Region' },
    { center: [7.5, 53.5], radius: 0.7, count: 2000, name: 'Lower Saxony Coast' },
    { center: [8.5, 52.5], radius: 0.6, count: 1500, name: 'Lower Saxony Inland' },
    { center: [12.0, 52.5], radius: 0.8, count: 2200, name: 'Brandenburg' },
    { center: [12.5, 54.0], radius: 0.6, count: 1800, name: 'Mecklenburg-Vorpommern' },
    { center: [11.5, 51.5], radius: 0.5, count: 1200, name: 'Saxony-Anhalt' },
    { center: [9.0, 51.5], radius: 0.4, count: 800, name: 'North Rhine-Westphalia' },
    { center: [7.0, 51.0], radius: 0.3, count: 600, name: 'Ruhr Area' },
    { center: [10.5, 49.5], radius: 0.4, count: 700, name: 'Bavaria North' },
    { center: [8.5, 50.0], radius: 0.3, count: 500, name: 'Hesse' },
    { center: [7.0, 49.5], radius: 0.4, count: 600, name: 'Rhineland-Palatinate' },
  ],
  uk: [
    { center: [-4.5, 57.5], radius: 0.8, count: 1500, name: 'Scottish Highlands' },
    { center: [-3.5, 56.0], radius: 0.5, count: 1200, name: 'Central Scotland' },
    { center: [-4.0, 55.5], radius: 0.4, count: 800, name: 'Southern Scotland' },
    { center: [-2.5, 54.5], radius: 0.5, count: 900, name: 'Cumbria' },
    { center: [-2.0, 53.5], radius: 0.4, count: 700, name: 'Lancashire' },
    { center: [-1.5, 54.5], radius: 0.5, count: 1000, name: 'Yorkshire' },
    { center: [0.5, 53.0], radius: 0.4, count: 600, name: 'Lincolnshire' },
    { center: [1.5, 52.5], radius: 0.3, count: 500, name: 'East Anglia' },
    { center: [-4.0, 52.5], radius: 0.5, count: 800, name: 'Wales' },
    { center: [-5.0, 50.5], radius: 0.3, count: 400, name: 'Cornwall' },
    // Offshore clusters
    { center: [1.5, 53.5], radius: 0.6, count: 800, name: 'Offshore East' },
    { center: [-3.5, 53.5], radius: 0.4, count: 500, name: 'Irish Sea Offshore' },
  ],
  eu: [
    // Germany
    { center: [9.0, 54.0], radius: 1.0, count: 3000, name: 'North Germany' },
    { center: [12.0, 52.5], radius: 0.8, count: 2000, name: 'East Germany' },
    // Spain
    { center: [-3.5, 42.0], radius: 1.0, count: 2500, name: 'Castile and León' },
    { center: [-8.0, 43.0], radius: 0.6, count: 1200, name: 'Galicia' },
    { center: [-1.5, 42.5], radius: 0.5, count: 1000, name: 'Navarra' },
    { center: [-2.5, 37.5], radius: 0.5, count: 800, name: 'Andalusia' },
    // France
    { center: [3.0, 49.5], radius: 0.8, count: 1500, name: 'Northern France' },
    { center: [-1.5, 48.0], radius: 0.5, count: 800, name: 'Brittany' },
    { center: [2.5, 44.5], radius: 0.4, count: 600, name: 'Massif Central' },
    // Denmark
    { center: [9.5, 56.0], radius: 0.6, count: 1500, name: 'Jutland' },
    // Netherlands
    { center: [5.5, 52.5], radius: 0.4, count: 800, name: 'Netherlands' },
    // Poland
    { center: [17.5, 54.0], radius: 0.6, count: 1000, name: 'Poland North' },
    { center: [19.0, 52.0], radius: 0.5, count: 700, name: 'Poland Central' },
    // Sweden
    { center: [14.0, 56.5], radius: 0.5, count: 800, name: 'Southern Sweden' },
    { center: [18.0, 63.0], radius: 0.8, count: 1200, name: 'Northern Sweden' },
    // Italy
    { center: [15.5, 41.0], radius: 0.5, count: 700, name: 'Southern Italy' },
    { center: [9.0, 44.5], radius: 0.3, count: 400, name: 'Northern Italy' },
    // Portugal
    { center: [-8.0, 40.0], radius: 0.5, count: 900, name: 'Portugal' },
    // Austria
    { center: [16.0, 48.0], radius: 0.4, count: 500, name: 'Austria East' },
    // Norway
    { center: [9.0, 59.0], radius: 0.6, count: 400, name: 'Southwest Norway' },
    { center: [10.5, 63.5], radius: 0.8, count: 600, name: 'Central Norway' },
    { center: [15.0, 68.0], radius: 0.5, count: 300, name: 'Northern Norway' },
    // Ireland
    { center: [-8.5, 53.5], radius: 0.6, count: 800, name: 'Ireland' },
    // Greece
    { center: [23.0, 39.0], radius: 0.5, count: 500, name: 'Greece' },
    // Romania
    { center: [27.5, 44.5], radius: 0.5, count: 600, name: 'Romania' },
  ],
};

const MANUFACTURERS = [
  'Vestas', 'Siemens Gamesa', 'GE Renewable Energy', 'Enercon', 
  'Nordex', 'Goldwind', 'Envision', 'Mingyang', 'Suzlon'
];

const TURBINE_MODELS: Record<string, string[]> = {
  'Vestas': ['V90-2.0', 'V110-2.0', 'V126-3.45', 'V150-4.2', 'V162-6.0'],
  'Siemens Gamesa': ['SG 3.4-132', 'SG 4.5-145', 'SG 5.0-145', 'SG 6.0-170', 'SG 8.0-167'],
  'GE Renewable Energy': ['GE 1.5-77', 'GE 2.5-120', 'GE 3.2-130', 'GE 5.3-158', 'GE 6.0-164'],
  'Enercon': ['E-82 E2', 'E-101 EP2', 'E-115 EP3', 'E-138 EP3', 'E-160 EP5'],
  'Nordex': ['N90/2500', 'N100/3300', 'N117/3000', 'N149/4.5', 'N163/5.X'],
  'Goldwind': ['GW121/2500', 'GW140/3.0S', 'GW155/4.5S', 'GW175/6.0'],
  'Envision': ['EN-121/2.5', 'EN-136/3.6', 'EN-156/4.5'],
  'Mingyang': ['MY2.0-121', 'MY3.0-135', 'MY5.0-170'],
  'Suzlon': ['S97-2.1', 'S111-2.1', 'S120-2.1', 'S128-2.6'],
};

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomGaussian(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function synthesizeTurbineData(region: RegionConfig): Turbine[] {
  const clusters = WIND_FARM_CLUSTERS[region.id] || WIND_FARM_CLUSTERS.us;
  const turbines: Turbine[] = [];

  for (const cluster of clusters) {
    for (let i = 0; i < cluster.count; i++) {
      // Generate positions in a gaussian distribution around cluster center
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.abs(randomGaussian(0, cluster.radius / 2));
      
      const lon = cluster.center[0] + distance * Math.cos(angle);
      const lat = cluster.center[1] + distance * Math.sin(angle) * 0.7; // Adjust for lat/lon ratio
      
      const manufacturer = randomChoice(MANUFACTURERS);
      const models = TURBINE_MODELS[manufacturer] || ['Unknown'];
      const model = randomChoice(models);
      
      // Capacity based on model vintage and randomness (1.5 - 8 MW range)
      const baseCapacity = randomInRange(1.5, 6.0);
      const capacity_mw = Math.round(baseCapacity * 10) / 10;
      
      // Year: more recent turbines are more common
      const yearBase = 2005 + Math.floor(Math.random() * Math.random() * 20);
      const year = Math.min(yearBase, 2025);
      
      // Hub height correlates with capacity
      const hub_height = Math.round(60 + capacity_mw * 15 + randomInRange(-10, 10));
      
      // Rotor diameter correlates with capacity
      const rotor_dia = Math.round(70 + capacity_mw * 20 + randomInRange(-10, 10));
      
      turbines.push({
        lon,
        lat,
        capacity_mw,
        manufacturer,
        model,
        project: cluster.name,
        year,
        state: cluster.name,
        hub_height,
        rotor_dia,
      });
    }
  }

  return turbines;
}

export function getTotalStats(turbines: Turbine[]): { count: number; totalMW: number } {
  return {
    count: turbines.length,
    totalMW: Math.round(turbines.reduce((sum, t) => sum + t.capacity_mw, 0)),
  };
}
