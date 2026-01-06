export interface Turbine {
  lon: number;
  lat: number;
  capacity_mw: number;
  manufacturer: string;
  model: string;
  project: string;
  year?: number;
  state: string;
  hub_height?: number;
  rotor_dia?: number;
}

export interface HexagonData {
  h3Index: string;
  total_mw: number;
  turbine_count: number;
  geometry: GeoJSON.Polygon;
}

export interface RegionConfig {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  hasRealData: boolean;
}

export const REGIONS: RegionConfig[] = [
  {
    id: 'germany',
    name: 'Germany',
    center: [10.5, 51.2],
    zoom: 5,
    hasRealData: true,
  },
  {
    id: 'uk',
    name: 'United Kingdom',
    center: [-3.5, 54.5],
    zoom: 5,
    hasRealData: true,
  },
  {
    id: 'denmark',
    name: 'Denmark',
    center: [9.5, 56.0],
    zoom: 6,
    hasRealData: true,
  },
  {
    id: 'france',
    name: 'France',
    center: [2.5, 46.5],
    zoom: 5,
    hasRealData: true,
  },
  {
    id: 'sweden',
    name: 'Sweden',
    center: [16.0, 62.0],
    zoom: 4,
    hasRealData: true,
  },
  {
    id: 'eu',
    name: 'European Union',
    center: [10.0, 50.0],
    zoom: 4,
    hasRealData: true,
  },
  {
    id: 'us',
    name: 'United States',
    center: [-98.5, 39.5],
    zoom: 4,
    hasRealData: false, // USGS data requires separate download
  },
];

export const WIND_COLORS = [
  '#e0f3db',
  '#a8ddb5',
  '#4eb3d3',
  '#2b8cbe',
  '#0868ac',
  '#084081',
];
