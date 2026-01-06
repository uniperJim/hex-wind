import Papa from 'papaparse';
import { Turbine, RegionConfig } from './types';

// Real data sources from Open Power System Data (OPSD)
// https://data.open-power-system-data.org/renewable_power_plants/
const OPSD_DATA_URLS: Record<string, string> = {
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

// Fetch real data from OPSD
export async function fetchRealTurbineData(
  region: RegionConfig,
  onProgress?: (message: string) => void
): Promise<Turbine[]> {
  const url = OPSD_DATA_URLS[region.id];
  
  if (!url) {
    onProgress?.(`No real data source for ${region.name}, using synthetic data...`);
    return synthesizeTurbineData(region);
  }

  try {
    onProgress?.(`Fetching real wind turbine data for ${region.name}...`);
    
    // Use a CORS proxy for development if needed
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    onProgress?.('Parsing CSV data...');
    const csvText = await response.text();
    
    const turbines = parseOPSDData(csvText);
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
