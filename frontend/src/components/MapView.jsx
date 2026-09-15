import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";

// Fix default marker icons (Leaflet + Vite quirk)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// markers: [{ lat, lng, label }], route: [[lat,lng], [lat,lng]] optional
const MapView = ({ center = [28.6139, 77.209], markers = [], route = [], zoom = 13 }) => {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m, i) => (
        <Marker key={i} position={[m.lat, m.lng]}>
          <Popup>{m.label}</Popup>
        </Marker>
      ))}
      {route.length > 1 && <Polyline positions={route} color="#ffcc33" weight={5} />}
    </MapContainer>
  );
};

export default MapView;
