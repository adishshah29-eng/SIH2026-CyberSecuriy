"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function getPinIcon() {
  return L.divIcon({
    html: '<div style="font-size:24px;line-height:1;transform:translate(-50%,-100%)">📍</div>',
    className: "",
    iconSize: [0, 0],
  });
}

export function OriginMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <div className="h-48 w-full overflow-hidden rounded-lg border border-neutral-200">
      <MapContainer
        center={[lat, lng]}
        zoom={9}
        scrollWheelZoom={false}
        dragging={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <Marker position={[lat, lng]} icon={getPinIcon()}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
