import type { SimulatedLocation } from '../types/avicia';

export interface RealGpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  placeName?: string;
  roadName?: string;
  neighbourhood?: string;
  city?: string;
}

export const MANAGUA_REFERENCE_LOCATIONS: SimulatedLocation[] = [
  {
    id: 'uam',
    name: 'Universidad Americana (UAM) — Referencia simulada',
    description: 'Campus universitario en Managua, sede de la investigación AVISIA.',
    lat: 12.114993,
    lng: -86.236174,
    nearbyReferences: ['Avenida Universitaria (simulada)', 'Parada de bus cercana (referencia)'],
    simulatedDestination: {
      name: 'Rotonda Rubén Darío (simulada)',
      lat: 12.1268,
      lng: -86.2636,
    },
  },
  {
    id: 'metrocentro',
    name: 'Sector Metrocentro / Rotonda Rubén Darío — Simulado',
    description: 'Zona comercial y nodo de transporte urbano de Managua.',
    lat: 12.1275,
    lng: -86.2634,
    nearbyReferences: ['Parada de autobús demostrativa', 'Cruce peatonal urbano (simulado)'],
    simulatedDestination: {
      name: 'Plaza de la Revolución (simulada)',
      lat: 12.1559,
      lng: -86.2718,
    },
  },
  {
    id: 'malecon',
    name: 'Puerto Salvador Allende / Plaza de la Revolución — Simulado',
    description: 'Entorno cultural y peatonal histórico en Managua.',
    lat: 12.1568,
    lng: -86.2705,
    nearbyReferences: ['Antigua Catedral de Managua (referencia)', 'Malecón de Managua (simulado)'],
  },
];

export class LocationService {
  private lastGeocoded: { lat: number; lng: number; placeName: string; roadName?: string; neighbourhood?: string; city?: string } | null =
    null;

  getReferenceLocations(): SimulatedLocation[] {
    return MANAGUA_REFERENCE_LOCATIONS;
  }

  isGeolocationSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  getCurrentPosition(): Promise<RealGpsPosition> {
    return new Promise((resolve, reject) => {
      if (!this.isGeolocationSupported()) {
        reject(new Error('Tu navegador no soporta geolocalización GPS.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          });
        },
        (err) => {
          reject(new Error(this.translateGeoError(err)));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    });
  }

  watchPosition(
    onUpdate: (pos: RealGpsPosition) => void,
    onError: (message: string) => void
  ): () => void {
    if (!this.isGeolocationSupported()) {
      onError('Tu navegador no soporta geolocalización GPS.');
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onUpdate({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        onError(this.translateGeoError(err));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }

  async reverseGeocode(
    lat: number,
    lng: number
  ): Promise<{ placeName: string; roadName?: string; neighbourhood?: string; city?: string }> {
    if (
      this.lastGeocoded &&
      this.distanceMeters(lat, lng, this.lastGeocoded.lat, this.lastGeocoded.lng) < 40
    ) {
      return this.lastGeocoded;
    }

    const controller = new AbortController();
    const timeout = typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), 6000)
      : null;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&accept-language=es`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Geocoding unavailable');
      const data = (await res.json()) as {
        address?: {
          road?: string;
          pedestrian?: string;
          neighbourhood?: string;
          suburb?: string;
          city?: string;
          town?: string;
          village?: string;
        };
      };
      const addr = data.address ?? {};
      const roadName = addr.road || addr.pedestrian;
      const neighbourhood = addr.neighbourhood || addr.suburb;
      const city = addr.city || addr.town || addr.village;
      const parts = [roadName, neighbourhood, city].filter(Boolean);
      const placeName =
        parts.length > 0
          ? parts.join(', ')
          : `latitud ${lat.toFixed(4)}, longitud ${lng.toFixed(4)}`;

      this.lastGeocoded = { lat, lng, placeName, roadName, neighbourhood, city };
      return this.lastGeocoded;
    } catch {
      return {
        placeName: `latitud ${lat.toFixed(4)}, longitud ${lng.toFixed(4)}`,
      };
    } finally {
      if (timeout !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeout);
      }
    }
  }

  distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  findNearestReference(lat: number, lng: number): { location: SimulatedLocation; distanceM: number } {
    let nearest = MANAGUA_REFERENCE_LOCATIONS[0];
    let minDist = this.distanceMeters(lat, lng, nearest.lat, nearest.lng);
    for (const loc of MANAGUA_REFERENCE_LOCATIONS.slice(1)) {
      const dist = this.distanceMeters(lat, lng, loc.lat, loc.lng);
      if (dist < minDist) {
        minDist = dist;
        nearest = loc;
      }
    }
    return { location: nearest, distanceM: minDist };
  }

  private translateGeoError(err: GeolocationPositionError): string {
    if (err.code === err.PERMISSION_DENIED) {
      return 'Permiso de ubicación GPS denegado en el navegador.';
    }
    if (err.code === err.POSITION_UNAVAILABLE) {
      return 'Señal GPS no disponible en este momento.';
    }
    if (err.code === err.TIMEOUT) {
      return 'Tiempo de espera agotado al obtener tu ubicación GPS.';
    }
    return 'No se pudo obtener la ubicación GPS.';
  }
}

export const locationService = new LocationService();

