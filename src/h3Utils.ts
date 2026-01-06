import { latLngToCell, cellToBoundary } from 'h3-js';
import { Turbine } from './types';

export function generateH3Indices(
  turbines: Turbine[],
  resolution: number
): Map<string, { total_mw: number; turbine_count: number }> {
  const hexMap = new Map<string, { total_mw: number; turbine_count: number }>();

  for (const turbine of turbines) {
    const h3Index = latLngToCell(turbine.lat, turbine.lon, resolution);
    
    const existing = hexMap.get(h3Index);
    if (existing) {
      existing.total_mw += turbine.capacity_mw;
      existing.turbine_count += 1;
    } else {
      hexMap.set(h3Index, {
        total_mw: turbine.capacity_mw,
        turbine_count: 1,
      });
    }
  }

  // Round total_mw for cleaner display
  for (const [, data] of hexMap) {
    data.total_mw = Math.round(data.total_mw * 10) / 10;
  }

  return hexMap;
}

export function h3ToGeoJSON(
  hexMap: Map<string, { total_mw: number; turbine_count: number }>
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  for (const [h3Index, data] of hexMap) {
    const boundary = cellToBoundary(h3Index);
    // H3 returns [lat, lng], GeoJSON needs [lng, lat]
    const coordinates = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
    // Close the polygon
    coordinates.push(coordinates[0]);

    features.push({
      type: 'Feature',
      properties: {
        h3Index,
        total_mw: data.total_mw,
        turbine_count: data.turbine_count,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function turbinesToGeoJSON(
  turbines: Turbine[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: turbines.map((t) => ({
      type: 'Feature',
      properties: {
        capacity_mw: t.capacity_mw,
        manufacturer: t.manufacturer,
        model: t.model,
        project: t.project,
        year: t.year,
        state: t.state,
        hub_height: t.hub_height,
        rotor_dia: t.rotor_dia,
      },
      geometry: {
        type: 'Point',
        coordinates: [t.lon, t.lat],
      },
    })),
  };
}

export function getMaxMW(
  hexMap: Map<string, { total_mw: number; turbine_count: number }>
): number {
  let max = 0;
  for (const [, data] of hexMap) {
    if (data.total_mw > max) max = data.total_mw;
  }
  return max;
}

export function aggregateHexagons(
  turbines: Turbine[],
  resolutions: number[] = [3, 4, 5, 6]
): Map<number, GeoJSON.FeatureCollection<GeoJSON.Polygon>> {
  const result = new Map<number, GeoJSON.FeatureCollection<GeoJSON.Polygon>>();
  
  for (const res of resolutions) {
    const hexMap = generateH3Indices(turbines, res);
    result.set(res, h3ToGeoJSON(hexMap));
  }
  
  return result;
}
