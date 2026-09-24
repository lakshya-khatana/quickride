import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";

// Fix default marker icons (Leaflet + Vite quirk)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Recenters the map whenever `center` changes — used to keep a live-moving marker in view
const MapAutoCenter = ({ center, active }) => {
  const map = useMap();
  useEffect(() => {
    if (active && center) {
      map.setView(center, map.getZoom());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1], active]);
  return null;
};

// Lets the user click/tap the map to pick a location (used for choosing pickup/destination)
const ClickToSelect = ({ onSelect }) => {
  useMapEvents({
    click(e) {
      if (onSelect) onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

// markers: [{ lat, lng, label }], route: [[lat,lng], [lat,lng]] optional
const MapView = ({
  center = [28.6139, 77.209],
  markers = [],
  route = [],
  zoom = 13,
  onLocationSelect = null,
  autoCenter = false,
}) => {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "100%", width: "100%", cursor: onLocationSelect ? "crosshair" : "" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]}>
          <Popup>{m.label}</Popup>
        </Marker>
      ))}
      {route.length > 1 && <Polyline positions={route} color="#ffcc33" weight={5} dashArray="6 8" />}
      {onLocationSelect && <ClickToSelect onSelect={onLocationSelect} />}
      <MapAutoCenter center={center} active={autoCenter} />
    </MapContainer>
  );
};

export default MapView;