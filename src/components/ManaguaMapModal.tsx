import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, AlertTriangle, Volume2, Navigation, CornerUpRight, LocateFixed, Loader2, ExternalLink } from 'lucide-react';
import type { Scenario } from '../types/avicia';
import { locationService, type RealGpsPosition } from '../services/LocationService';
import { escapeHtml } from '../utils/sanitize';

interface ManaguaMapProps {
  scenario: Scenario;
  realGps: RealGpsPosition | null;
  gpsActive: boolean;
  gpsLoading: boolean;
  gpsError: string | null;
  onToggleGps: () => void;
  onSpeakText: (text: string) => void;
  compact?: boolean;
}

const useWazeLeafletMap = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  scenario: Scenario,
  realGps: RealGpsPosition | null
) => {
  useEffect(() => {
    if (!containerRef.current) return;

    const { location } = scenario;
    const centerLat = realGps ? realGps.lat : location.lat;
    const centerLng = realGps ? realGps.lng : location.lng;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([centerLat, centerLng], realGps ? 16 : 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    if (realGps) {
      // GPS accuracy halo
      L.circle([realGps.lat, realGps.lng], {
        radius: Math.min(250, Math.max(12, realGps.accuracy)),
        color: '#22d3ee',
        fillColor: '#06b6d4',
        fillOpacity: 0.16,
        weight: 1.5,
      }).addTo(map);

      // Real GPS Waze puck
      L.circleMarker([realGps.lat, realGps.lng], {
        radius: 10,
        color: '#ffffff',
        fillColor: '#10b981',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup(
          `<strong>GPS Real:</strong><br/>${escapeHtml(
            realGps.placeName ?? `${realGps.lat.toFixed(5)}, ${realGps.lng.toFixed(5)}`
          )}<br/>Precisión: ±${Math.round(realGps.accuracy)} m`
        );
    } else {
      // Waze-style glowing navigation puck for demo position
      L.circleMarker([location.lat, location.lng], {
        radius: 10,
        color: '#ffffff',
        fillColor: '#06b6d4',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup(`<strong>Tu posición (demo):</strong><br/>${escapeHtml(location.name)}`);
    }

    if (location.simulatedDestination) {
      const dest = location.simulatedDestination;
      L.circleMarker([dest.lat, dest.lng], {
        radius: 9,
        color: '#ffffff',
        fillColor: '#10b981',
        fillOpacity: 1,
        weight: 2.5,
      })
        .addTo(map)
        .bindPopup(`<strong>Destino:</strong><br/>${escapeHtml(dest.name)}`);

      // Waze-style bright cyan-blue route line
      L.polyline(
        [
          [centerLat, centerLng],
          [dest.lat, dest.lng],
        ],
        { color: '#38bdf8', weight: 6, opacity: 0.9 }
      ).addTo(map);
    }

    for (const refLoc of locationService.getReferenceLocations()) {
      L.circleMarker([refLoc.lat, refLoc.lng], {
        radius: 5,
        color: '#94a3b8',
        fillColor: '#475569',
        fillOpacity: 0.85,
        weight: 1.5,
      })
        .addTo(map)
        .bindPopup(`<strong>Referencia:</strong><br/>${escapeHtml(refLoc.name)}`);
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      map.remove();
    };
  }, [containerRef, scenario, realGps]);
};

export const ManaguaWazeMobile: React.FC<ManaguaMapProps> = ({
  scenario,
  realGps,
  gpsActive,
  gpsLoading,
  gpsError,
  onToggleGps,
  onSpeakText,
}) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [reply, setReply] = useState('');
  const [provider, setProvider] = useState<'google' | 'waze'>('google');
  useWazeLeafletMap(mapRef, scenario, realGps);

  const activeLat = realGps ? realGps.lat : scenario.location.lat;
  const activeLng = realGps ? realGps.lng : scenario.location.lng;
  const googleEmbedUrl = `https://maps.google.com/maps?q=${activeLat},${activeLng}&hl=es&z=${
    realGps ? 17 : 15
  }&output=embed`;
  const googleExternalUrl = `https://www.google.com/maps/search/?api=1&query=${activeLat},${activeLng}`;

  const cleanName = scenario.location.name
    .replace(/\s*—\s*Simulado/gi, '')
    .replace(/\s*\(simulado\)/gi, '');

  const askWhereAmI = () => {
    const text = realGps
      ? `Estás en ${realGps.placeName ?? 'tu ubicación actual'}, precisión de ${Math.round(realGps.accuracy)} metros.`
      : `Te encuentras cerca de ${cleanName}.`;
    setReply(text);
    onSpeakText(text);
  };

  const askWhatNearby = () => {
    if (realGps) {
      const nearest = locationService.findNearestReference(realGps.lat, realGps.lng);
      const nearestClean = nearest.location.name
        .replace(/\s*—\s*Referencia simulada/gi, '')
        .replace(/\s*—\s*Simulado/gi, '');
      const distText =
        nearest.distanceM >= 1000
          ? `${(nearest.distanceM / 1000).toFixed(1)} kilómetros`
          : `${nearest.distanceM} metros`;
      const text = `Referencia más cercana: ${nearestClean}, a ${distText}.`;
      setReply(text);
      onSpeakText(text);
      return;
    }
    const refs = scenario.location.nearbyReferences
      .map((r) => r.replace(/\s*\(referencia simulada\)/gi, '').replace(/\s*\(simulada?\)/gi, ''))
      .join(', ');
    const text = `En tu entorno cercano hay: ${refs}.`;
    setReply(text);
    onSpeakText(text);
  };

  return (
    <div className="relative h-[430px] rounded-2xl overflow-hidden border border-white/10 bg-[#0b111d]">
      {/* Real Google Maps Embed OR Waze Leaflet Map */}
      {provider === 'google' ? (
        <iframe
          title="Ubicación en Google Maps"
          src={googleEmbedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="w-full h-full border-0"
          allowFullScreen
        />
      ) : (
        <div ref={mapRef} className="w-full h-full waze-map-tiles" />
      )}

      {/* Top Location Banner + GPS Toggle + Provider Switch */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-[400] rounded-2xl bg-[#111827]/95 border border-white/10 p-2.5 shadow-xl space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-cyan-500 flex items-center justify-center text-slate-950 shrink-0">
            <CornerUpRight className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">
              {realGps
                ? realGps.placeName ?? `${realGps.lat.toFixed(4)}, ${realGps.lng.toFixed(4)}`
                : cleanName}
            </div>
            <div className="text-[10px] flex items-center gap-1 truncate">
              {realGps ? (
                <span className="text-emerald-300 font-medium">
                  GPS real activo · ±{Math.round(realGps.accuracy)} m
                </span>
              ) : gpsLoading ? (
                <span className="text-cyan-300 font-medium">
                  Obteniendo ubicación real...
                </span>
              ) : (
                <span className="text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Toca GPS para ubicar tu posición real
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleGps}
            title={gpsActive ? 'Desactivar GPS real' : 'Activar GPS real'}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-colors ${
              gpsActive
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30'
            }`}
          >
            {gpsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5" />
            )}
            GPS
          </button>
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-white/10 text-[10px]">
            <button
              type="button"
              onClick={() => setProvider('google')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                provider === 'google'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              Google Maps
            </button>
            <button
              type="button"
              onClick={() => setProvider('waze')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                provider === 'waze'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300'
              }`}
            >
              Vista Waze
            </button>
          </div>
          <a
            href={googleExternalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 hover:underline"
          >
            Abrir en Maps
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Waze Bottom Floating Controls */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-[400] space-y-1.5">
        {gpsError && (
          <div className="p-2 rounded-xl bg-amber-950/90 border border-amber-500/40 text-[11px] text-amber-200 shadow-lg">
            {gpsError}
          </div>
        )}
        {reply && (
          <div className="p-2 rounded-xl bg-[#111827]/95 border border-cyan-500/30 text-[11px] text-cyan-100 shadow-lg">
            {reply}
          </div>
        )}
        <div className="rounded-2xl bg-[#111827]/95 border border-white/10 p-2 shadow-xl flex items-center gap-2">
          <button
            type="button"
            onClick={askWhereAmI}
            className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-[11px]"
          >
            <Volume2 className="w-3.5 h-3.5" />
            ¿Dónde estoy?
          </button>
          <button
            type="button"
            onClick={askWhatNearby}
            className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-[11px] border border-white/10"
          >
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            ¿Qué hay cerca?
          </button>
        </div>
      </div>
    </div>
  );
};

export const ManaguaMapSection: React.FC<ManaguaMapProps> = ({
  scenario,
  realGps,
  gpsActive,
  gpsLoading,
  gpsError,
  onToggleGps,
  onSpeakText,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [reply, setReply] = useState<string>('');
  useWazeLeafletMap(mapContainerRef, scenario, realGps);

  const askWhereAmI = () => {
    if (realGps) {
      const text = `Estás en ${realGps.placeName ?? 'tu ubicación actual'}, precisión de ${Math.round(realGps.accuracy)} metros.`;
      setReply(text);
      onSpeakText(text);
      return;
    }
    const cleanName = scenario.location.name
      .replace(/\s*—\s*Simulado/gi, '')
      .replace(/\s*\(simulado\)/gi, '');
    const text = `Te encuentras cerca de ${cleanName}.`;
    setReply(text);
    onSpeakText(text);
  };

  const askWhatNearby = () => {
    if (realGps) {
      const nearest = locationService.findNearestReference(realGps.lat, realGps.lng);
      const nearestClean = nearest.location.name
        .replace(/\s*—\s*Referencia simulada/gi, '')
        .replace(/\s*—\s*Simulado/gi, '');
      const distText =
        nearest.distanceM >= 1000
          ? `${(nearest.distanceM / 1000).toFixed(1)} kilómetros`
          : `${nearest.distanceM} metros`;
      const text = `Referencia más cercana: ${nearestClean}, a ${distText}.`;
      setReply(text);
      onSpeakText(text);
      return;
    }
    const refs = scenario.location.nearbyReferences
      .map((r) => r.replace(/\s*\(referencia simulada\)/gi, '').replace(/\s*\(simulada?\)/gi, ''))
      .join(', ');
    const text = `En tu entorno cercano hay: ${refs}.`;
    setReply(text);
    onSpeakText(text);
  };

  return (
    <section
      id="explorar-managua-section"
      aria-label="Explorar Managua"
      className="rounded-2xl bg-[#111827]/90 border border-white/10 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan-400" />
            Explorar Managua
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Navegación contextual estilo Waze con soporte de GPS real del navegador
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleGps}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              gpsActive
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                : 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-500/25'
            }`}
          >
            {gpsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5" />
            )}
            {gpsActive ? 'GPS Real Activo' : 'Activar GPS Real'}
          </button>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-medium text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            {realGps ? `Precisión ±${Math.round(realGps.accuracy)} m` : 'Modo demo'}
          </span>
        </div>
      </div>

      {gpsError && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200">
          {gpsError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 relative rounded-xl overflow-hidden border border-white/10 h-[310px]">
          <div ref={mapContainerRef} className="w-full h-full waze-map-tiles" />
          <div className="absolute top-3 left-3 right-3 z-[400] max-w-sm rounded-xl bg-[#0b0f17]/90 border border-white/10 p-2.5 flex items-center gap-2.5 shadow-lg">
            <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center text-slate-950 shrink-0">
              <CornerUpRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {scenario.location.simulatedDestination?.name ?? scenario.location.name}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Origen: {realGps ? realGps.placeName ?? 'GPS actual' : scenario.location.name}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="p-3 rounded-xl bg-[#0b0f17] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
              {realGps ? 'Ubicación GPS real' : 'Ubicación actual (demo)'}
            </div>
            <p className="text-xs font-semibold text-slate-100">
              {realGps
                ? realGps.placeName ?? `${realGps.lat.toFixed(5)}, ${realGps.lng.toFixed(5)}`
                : scenario.location.name}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {realGps
                ? `Coordenadas: ${realGps.lat.toFixed(5)}, ${realGps.lng.toFixed(5)} · Precisión ±${Math.round(realGps.accuracy)} m`
                : scenario.location.description}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#0b0f17] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Referencias cercanas
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300 list-disc list-inside">
              {scenario.location.nearbyReferences.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={askWhereAmI}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs"
            >
              <Volume2 className="w-3.5 h-3.5" />
              ¿Dónde estoy?
            </button>
            <button
              type="button"
              onClick={askWhatNearby}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 font-medium text-xs"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              ¿Qué hay cerca?
            </button>
          </div>

          {reply && (
            <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/25 text-xs text-cyan-100">
              {reply}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
