import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Webpack
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Create a default icon
const createDefaultIcon = () => {
  try {
    const defaultIcon = L.icon({
      iconUrl: icon,
      shadowUrl: iconShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = defaultIcon;
    return defaultIcon;
  } catch (error) {
    console.error('Error creating default icon:', error);
    return null;
  }
};

// Initialize the default icon
createDefaultIcon();

const statusToColor = {
  pending: '#3b82f6',    // blue-500
  inprogress: '#f59e0b', // amber-500
  solved: '#10b981',     // emerald-500
  rejected: '#ef4444',   // red-500
  default: '#9ca3af'     // gray-400
};

const getCoordinates = (location) => {
  if (!location) {
    console.log('No location object provided');
    return null;
  }
  
  // Debug log the location object
  console.log('Processing location object:', JSON.stringify(location, null, 2));
  
  // Format 1: Direct lat/lng properties
  if (typeof location.lat === 'number' && typeof location.lng === 'number') {
    console.log('Using direct lat/lng properties');
    return [location.lat, location.lng];
  }
  
  // Format 2: String lat/lng
  if (location.lat !== undefined && location.lng !== undefined) {
    console.log('Using string lat/lng properties');
    const lat = parseFloat(location.lat);
    const lng = parseFloat(location.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
  }
  
  // Format 3: Coordinates object with latitude/longitude
  if (location.coordinates) {
    // Format: { coordinates: { latitude: 12.97, longitude: 77.59 } }
    if (location.coordinates.latitude !== undefined && location.coordinates.longitude !== undefined) {
      console.log('Using coordinates.latitude/longitude');
      return [
        parseFloat(location.coordinates.latitude),
        parseFloat(location.coordinates.longitude)
      ];
    }
    // Format: { coordinates: [longitude, latitude] } (GeoJSON format)
    else if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      console.log('Using coordinates array [lng, lat]');
      return [
        parseFloat(location.coordinates[1]), // lat
        parseFloat(location.coordinates[0])  // lng
      ];
    }
  }
  
  // Format 4: Direct lat/lng as numbers in the root
  if (location.latitude !== undefined && location.longitude !== undefined) {
    console.log('Using latitude/longitude properties');
    return [
      parseFloat(location.latitude),
      parseFloat(location.longitude)
    ];
  }
  
  console.log('No valid coordinate format found in location object');
  return null;
};

const ComplaintsMap = ({ complaints = [], onMarkerClick, className = 'h-96' }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const [isMounted, setIsMounted] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);

  // Debug: Log component props and state
  console.log('ComplaintsMap render', { 
    complaintsCount: complaints?.length,
    isMounted,
    initialized,
    error
  });

  // Initialize map
  useEffect(() => {
    let resizeTimer;
    
    const initMap = () => {
      if (!mapRef.current) {
        console.error('Map container ref is not available');
        setError('Map container not found');
        return;
      }
      
      if (mapInstance.current) {
        console.log('Map already initialized, skipping...');
        return;
      }
      
      console.log('Initializing map...');
      console.log('Container dimensions:', {
        width: mapRef.current.offsetWidth,
        height: mapRef.current.offsetHeight,
        style: window.getComputedStyle(mapRef.current)
      });
      
      try {
        // Initialize the map with a default view of India
        mapInstance.current = L.map(mapRef.current, {
          center: [20.5937, 78.9629], // Center of India
          zoom: 5,
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true, // Better performance with many markers
          renderer: L.canvas(), // Use canvas renderer for better performance
          fadeAnimation: true,
          markerZoomAnimation: true
        });
        
        console.log('Map instance created:', mapInstance.current);
        
        // Add OpenStreetMap tile layer
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          detectRetina: true,
          noWrap: true
        }).addTo(mapInstance.current);
        
        console.log('Tile layer added:', tileLayer);
        
        // Mark as mounted and initialized
        setIsMounted(true);
        setInitialized(true);
        setError(null);
        
        // Force a resize to ensure the map renders correctly
        resizeTimer = setTimeout(() => {
          console.log('Triggering map resize...');
          if (mapInstance.current) {
            mapInstance.current.invalidateSize(true);
            console.log('Map size invalidated');
          }
        }, 100);
        
        console.log('Map initialized successfully');
        
        // Debug: Log map container after initialization
        setTimeout(() => {
          console.log('Map container after init:', {
            container: mapRef.current,
            map: mapInstance.current,
            size: mapInstance.current?.getSize(),
            bounds: mapInstance.current?.getBounds()
          });
        }, 200);
        
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Failed to initialize map. Please try again.');
        
        // Clean up any partially created map instance
        if (mapInstance.current) {
          try {
            mapInstance.current.off();
            mapInstance.current.remove();
          } catch (e) {
            console.error('Error during map cleanup after error:', e);
          }
          mapInstance.current = null;
        }
      }
    };
    
    // Initialize the map
    initMap();
    
    // Cleanup function
    return () => {
      console.log('Cleaning up map...');
      if (resizeTimer) clearTimeout(resizeTimer);
      if (mapInstance.current) {
        try {
          mapInstance.current.off();
          mapInstance.current.remove();
        } catch (e) {
          console.error('Error during map cleanup:', e);
        }
        mapInstance.current = null;
      }
      setIsMounted(false);
      setInitialized(false);
    };
  }, []); // Empty dependency array means this effect runs once on mount

  // Update markers when complaints change
  useEffect(() => {
    if (!mapInstance.current || !isMounted || !initialized) {
      console.log('Skipping marker update - map not ready');
      return;
    }
    
    console.log('Updating markers...');
    
    // Clear existing markers
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (marker && mapInstance.current.hasLayer(marker)) {
        mapInstance.current.removeLayer(marker);
      }
    });
    markersRef.current = {};

    // Add new markers
    const validMarkers = [];
    let hasValidMarkers = false;
    const bounds = [];
    
    console.log('Processing complaints:', complaints);
    complaints.forEach(complaint => {
      if (!complaint || !complaint.location) {
        console.log('Skipping complaint - no location:', complaint?.id);
        return;
      }
      
      try {
        console.log('Complaint location data:', {
          id: complaint.id,
          location: complaint.location,
          hasLatLng: complaint.location.lat !== undefined && complaint.location.lng !== undefined,
          hasCoordinates: complaint.location.coordinates !== undefined
        });
        const coords = getCoordinates(complaint.location);
        console.log('Extracted coordinates:', coords);
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          console.log('Invalid coordinates for complaint:', complaint.id, coords);
          return;
        }
        
        const [lat, lng] = coords.map(Number);
        if (isNaN(lat) || isNaN(lng)) {
          console.log('Invalid lat/lng values for complaint:', complaint.id, { lat, lng });
          return;
        }
        
        console.log('Creating marker for complaint:', complaint.id, { lat, lng });
        
        const status = (complaint.status || 'pending').toLowerCase();
        // Normalize status to match our color mapping
        const normalizedStatus = status === 'solved' ? 'solved' : status;
        const color = statusToColor[normalizedStatus] || statusToColor.default;
        
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            html: `<div class="w-4 h-4 rounded-full border-2 border-white" style="background-color: ${color}"></div>`,
            className: 'bg-transparent border-none',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })
        });
        
        // Create popup content
        const popupContent = `
          <div class="text-sm min-w-[200px] p-2">
            <p class="font-semibold truncate">${complaint.reason || 'No title'}</p>
            <p class="mt-1">
              Status: 
              <span class="font-medium" style="color: ${color}">
                ${status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </p>
            ${complaint.location?.name ? `<p class="truncate">Location: ${complaint.location.name}</p>` : ''}
            <button 
              class="mt-2 w-full px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
              onclick="window.dispatchEvent(new CustomEvent('marker-click', { detail: '${complaint.id}' }))"
            >
              View Details
            </button>
          </div>
        `;
        
        marker.bindPopup(popupContent);
        marker.addTo(mapInstance.current);
        
        markersRef.current[complaint.id] = marker;
        validMarkers.push(marker);
        bounds.push([lat, lng]);
        hasValidMarkers = true;
        
      } catch (error) {
        console.error('Error creating marker for complaint:', complaint?.id, error);
      }
    });
    
    // Fit bounds if we have valid markers
    if (hasValidMarkers && bounds.length > 0) {
      try {
        const boundsGroup = L.featureGroup(validMarkers);
        mapInstance.current.fitBounds(boundsGroup.getBounds().pad(0.2), { 
          padding: [50, 50],
          maxZoom: 15
        });
      } catch (e) {
        console.error('Error fitting bounds:', e);
      }
    }
    
  }, [complaints]);

  // Handle marker click events
  useEffect(() => {
    const handleMarkerClick = (e) => {
      if (onMarkerClick && e.detail) {
        onMarkerClick(e.detail);
      }
    };

    window.addEventListener('marker-click', handleMarkerClick);
    return () => {
      window.removeEventListener('marker-click', handleMarkerClick);
    };
  }, [onMarkerClick]);

  // Handle external focus requests to zoom to a specific complaint marker
  useEffect(() => {
    const handleFocusComplaint = (e) => {
      const id = e?.detail;
      if (!id || !mapInstance.current) return;
      const marker = markersRef.current[id];
      if (marker) {
        try {
          const latlng = marker.getLatLng();
          mapInstance.current.setView(latlng, 16, { animate: true });
          if (marker.openPopup) marker.openPopup();
        } catch (err) {
          console.error('Failed to focus complaint marker', err);
        }
      }
    };
    window.addEventListener('focus-complaint', handleFocusComplaint);
    return () => window.removeEventListener('focus-complaint', handleFocusComplaint);
  }, []);

  // Debug info
  console.log('Map render state:', {
    isMounted,
    initialized,
    error,
    complaintsCount: complaints?.length,
    mapRef: mapRef.current ? 'Exists' : 'Null',
    mapInstance: mapInstance.current ? 'Exists' : 'Null'
  });

  return (
    <div className={`w-full rounded-lg overflow-hidden shadow-md border border-gray-200 bg-gray-50 ${className}`}>
      {/* Error message */}
      {error && (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          <div className="text-red-500 text-lg font-medium mb-2">Error Loading Map</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Reload Map
          </button>
        </div>
      )}

      {/* Loading state */}
      {!isMounted && !error && (
        <div className="w-full h-full flex flex-col items-center justify-center p-6">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      )}

      {/* Map container with explicit dimensions */}
      <div className="relative w-full" style={{ height: '400px' }}>
        <div 
          ref={mapRef} 
          className="w-full h-full"
          style={{
            minHeight: '400px',
            backgroundColor: '#f0f0f0',
            position: 'relative',
            zIndex: 1
          }}
        >
          {isMounted && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-50">
              <div className="text-center p-4 bg-white rounded-lg shadow-lg">
                <p className="font-medium">Map is loading...</p>
                <p className="text-sm text-gray-600 mt-1">If this message persists, check the console for errors</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add global styles for the map container */}
      <style>{`
        .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          min-height: 400px !important;
          z-index: 10;
        }
        .leaflet-tile {
          filter: none !important;
          -webkit-filter: none !important;
        }
      `}</style>
    </div>
  );
};

export default React.memo(ComplaintsMap);
