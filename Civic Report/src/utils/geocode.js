// Lightweight geocoding utilities using OpenStreetMap Nominatim
// Do not abuse these endpoints; keep requests minimal.

export async function geocodePlaceName(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CivicReport/1.0 (contact@example.com)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const top = data[0];
  return {
    name: top.display_name,
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
  };
}

export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CivicReport/1.0 (contact@example.com)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    name: data.display_name || data.address?.road || data.address?.suburb || data.address?.city || 'Nearby Location',
  };
}
