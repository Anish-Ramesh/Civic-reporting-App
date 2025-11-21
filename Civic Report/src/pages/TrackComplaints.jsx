import React, { useState, useEffect, useRef } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { auth } from "../utils/Firebase";
import { fetchComplaints } from "../utils/FirebaseFunctions.jsx";
import { Statuses, statusColors } from "../utils/enums";
import ComplaintDetailModal from "../components/ComplaintDetailModal";
import SpinnerModal from "../components/SpinnerModal";

// Import Leaflet with ESM syntax
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
const DefaultIcon = L.icon({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Set default icon for all markers
L.Marker.prototype.options.icon = DefaultIcon;

const TrackComplaints = () => {
  const [complaints, setComplaints] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const containerMounted = useRef(false);

  // Track initialization state with ref to prevent double initialization in StrictMode
  const initStarted = useRef(false);
  const initAttempts = useRef(0);
  const MAX_INIT_ATTEMPTS = 5;
  
  // Function to check Leaflet environment
  const checkLeafletEnvironment = () => {
    console.group('Leaflet Environment Check');
    console.log('Leaflet available:', !!L);
    if (L) {
      console.log('Leaflet version:', L.version);
      console.log('L.map available:', typeof L.map === 'function');
      console.log('L.tileLayer available:', typeof L.tileLayer === 'function');
    }
    console.groupEnd();
  };
  
  // Set up container mounted state
  useEffect(() => {
    containerMounted.current = true;
    return () => {
      containerMounted.current = false;
    };
  }, []);

  // Initialize map when component mounts and container is ready
  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initStarted.current) return;
    
    const initialize = () => {
      if (!containerMounted.current || !mapContainerRef.current) {
        console.log('Container not ready, retrying...');
        setTimeout(initialize, 100);
        return;
      }
      
      initStarted.current = true;
      console.log('Initializing map...');
      checkLeafletEnvironment();
      
      // Ensure Leaflet is available
      if (!L) {
        console.error('Leaflet not loaded!');
        setIsLoading(false);
        return;
      }
      
      // Proceed with map initialization
      initializeMap();
    };
    
    initialize();
    
    // Cleanup function remains the same
    
    let mapInitialized = false;
    let initTimer = null;
    let resizeHandler = null;
    let mapInstance = null;
    
    // Function to safely remove the map
    const safeRemoveMap = () => {
      try {
        if (mapInstance) {
          mapInstance.off();
          mapInstance.remove();
        }
      } catch (e) {
        console.error('Error removing map:', e);
      } finally {
        mapInstance = null;
        mapRef.current = null;
      }
    };
    
    const initializeMap = () => {
      try {
        // Check max attempts
        if (initAttempts.current >= MAX_INIT_ATTEMPTS) {
          console.error('Max initialization attempts reached, giving up');
          setIsLoading(false);
          return;
        }
        
        initAttempts.current++;
        console.log(`Initialization attempt ${initAttempts.current}/${MAX_INIT_ATTEMPTS}`);
        
        if (!mapContainerRef.current) {
          console.error('Map container not found');
          return;
        }
        
        if (mapRef.current) {
          console.log('Map already initialized');
          return;
        }
        
        // Check if container is visible and has dimensions
        const container = mapContainerRef.current;
        const containerStyle = window.getComputedStyle(container);
        const isVisible = container.offsetWidth > 0 && 
                         container.offsetHeight > 0 &&
                         containerStyle.display !== 'none' &&
                         containerStyle.visibility !== 'hidden';
        
        if (!isVisible) {
          console.warn('Map container is not visible or has zero dimensions');
          // Retry after a delay if not visible
          setTimeout(initializeMap, 500);
          return;
        }
        
        console.log('Container dimensions:', {
          width: container.offsetWidth,
          height: container.offsetHeight,
          display: containerStyle.display,
          visibility: containerStyle.visibility
        });
        
        // Ensure container has a valid size
        if (container.offsetWidth <= 0 || container.offsetHeight <= 0) {
          console.warn('Container has invalid dimensions, retrying...');
          setTimeout(initializeMap, 300);
          return;
        }
        
        console.log('Creating map instance...');
        
        // Initialize map with proper options
        mapInstance = L.map(mapContainerRef.current, {
          center: [20.5937, 78.9629], // India center as default
          zoom: 5,
          zoomControl: true,
          preferCanvas: true,
          renderer: L.canvas(),
          tap: false, // Fix tap issues on mobile
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          attributionControl: true
        });
        
        mapRef.current = mapInstance;
        console.log('Map instance created');
        
        // Add tile layer with error handling
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          detectRetina: true,
          crossOrigin: true
        });
        
        tileLayer.addTo(mapInstance);
        console.log('Tile layer added');
        
        // Initialize markers layer
        markersLayerRef.current = L.layerGroup().addTo(mapInstance);
        console.log('Markers layer initialized');
        
        // Handle map resize and invalidate size
        resizeHandler = () => {
          if (mapInstance) {
            console.log('Handling window resize...');
            mapInstance.invalidateSize({ animate: false });
          }
        };
        
        // Initial size update with a small delay
        const initMapView = () => {
          if (mapInstance) {
            console.log('Initializing map view...');
            
            // Force a resize and invalidate
            mapInstance.invalidateSize({ animate: false });
            
            // Set a default view if no markers are present
            if (complaints.length === 0) {
              mapInstance.setView([20.5937, 78.9629], 5);
            }
            
            mapInitialized = true;
            setIsLoading(false);
            console.log('Map initialization complete');
          }
        };
        
        // Add resize listener
        window.addEventListener('resize', resizeHandler);
        
        // Initial setup with a small delay
        initTimer = setTimeout(() => {
          try {
            initMapView();
          } catch (error) {
            console.error('Error in map view initialization:', error);
            setIsLoading(false);
          }
        }, 500);
        
      } catch (error) {
        console.error('Error initializing map:', error);
        setIsLoading(false);
      }
    };
    
    // Initialize the map after a short delay to ensure DOM is ready
    initTimer = setTimeout(() => {
      if (!mapInitialized) {
        initializeMap();
      }
    }, 300);
    
    // Cleanup function
    return () => {
      console.log('Cleaning up map...');
      
      // Clear any pending initialization
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      
      // Remove resize listener
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      
      // Clean up markers layer
      if (markersLayerRef.current) {
        try {
          markersLayerRef.current.clearLayers();
          markersLayerRef.current = null;
        } catch (e) {
          console.error('Error cleaning up markers layer:', e);
        }
      }
      
      // Safely remove the map instance
      safeRemoveMap();
      
      // Reset state
      mapInitialized = false;
      initStarted.current = false;
      initAttempts.current = 0;
      console.log('Map cleanup complete');
    };
  }, []);

  // Function to update complaint status
  const updateComplaintStatus = async (complaintId, newStatus) => {
    try {
      setIsLoading(true);
      const complaintRef = doc(db, 'complaints', complaintId);
      await updateDoc(complaintRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      
      // Update local state to reflect the change
      setComplaints(prevComplaints => 
        prevComplaints.map(comp => 
          comp.id === complaintId 
            ? { ...comp, status: newStatus, updatedAt: new Date().toISOString() }
            : comp
        )
      );
      
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(`Failed to update status: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update markers whenever complaints change
  useEffect(() => {
    if (!window.L || !mapRef.current || !markersLayerRef.current) return;
    
    const L = window.L;
    
    try {
      // Clear previous markers
      markersLayerRef.current.clearLayers();
      
      const bounds = L.latLngBounds([]);
      let hasValidMarkers = false;
      
      // Add new markers with status-based styling
      complaints.forEach((c) => {
        const lat = c?.location?.lat;
        const lng = c?.location?.lng;
        
        if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
          try {
            // Determine marker color based on status
            const status = c.status || 'pending';
            const statusColor = {
              'pending': '#f59e0b',    // Yellow
              'inProgress': '#3b82f6',  // Blue
              'solved': '#10b981',      // Green
              'rejected': '#ef4444'     // Red
            }[status] || '#9ca3af';     // Default gray

            // Create a custom marker with status color
            const marker = L.divIcon({
              className: 'custom-marker',
              html: `
                <div style="
                  width: 24px; 
                  height: 24px; 
                  background: ${statusColor};
                  border: 2px solid white;
                  border-radius: 50%;
                  position: relative;
                  cursor: pointer;
                ">
                  <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                    text-align: center;
                    text-shadow: 0 0 2px rgba(0,0,0,0.5);
                  ">
                    ${status.charAt(0).toUpperCase()}
                  </div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12]
            });
            
            const markerInstance = L.marker([lat, lng], {
              title: `Complaint #${c.id || 'N/A'}`,
              icon: marker
            });
            
            const label = `#${c.id || ''} - ${c.reason || 'Complaint'}`;
            const address = c?.location?.name || 'No address provided';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            markerInstance.bindPopup(`
              <div style="min-width: 250px">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 1.1em;">${label}</strong>
                  <span style="
                    background: ${statusColor}20;
                    color: ${statusColor};
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.8em;
                    font-weight: 500;
                    border: 1px solid ${statusColor}40;
                  ">
                    ${statusText}
                  </span>
                </div>
                <div style="color: #4b5563; margin-bottom: 8px;">
                  <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    ${address}
                  </div>
                  <div style="display: flex; align-items: center; font-size: 0.9em; color: #6b7280;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    ${new Date(c.timestamp).toLocaleString()}
                  </div>
                </div>
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                  <button 
                    onclick="event.stopPropagation(); window.parent.postMessage({type: 'OPEN_COMPLAINT', id: '${c.id}'}, '*');"
                    style="
                      background: #3b82f6;
                      color: white;
                      border: none;
                      padding: 4px 12px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 0.85em;
                      display: flex;
                      align-items: center;
                      gap: 4px;
                    "
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Details
                  </button>
                </div>
              </div>
            `);
            
            markerInstance.on('click', (e) => {
              const clickedComplaint = complaints.find(comp => 
                comp.location?.lat === e.latlng.lat && 
                comp.location?.lng === e.latlng.lng
              );
              
              if (clickedComplaint) {
                setSelectedComplaint(clickedComplaint);
                setIsModalOpen(true);
              }
            });
            
            markerInstance.addTo(markersLayerRef.current);
            bounds.extend([lat, lng]);
            hasValidMarkers = true;
          } catch (error) {
            console.error('Error creating marker:', error);
          }
        }
      });
      
      // Fit map to markers if we have any valid ones
      if (hasValidMarkers && bounds.isValid()) {
        setTimeout(() => {
          if (mapRef.current) {
            // Only fit bounds if we have more than one marker
            if (complaints.length > 1) {
              mapRef.current.fitBounds(bounds.pad(0.2));
            } else if (complaints.length === 1) {
              // For single marker, center on it with a reasonable zoom
              mapRef.current.setView(bounds.getCenter(), 15);
            }
            mapRef.current.invalidateSize({ animate: false });
          }
        }, 100);
      } else if (mapRef.current) {
        // If no valid markers, ensure we have a valid view
        mapRef.current.setView([20.5937, 78.9629], 5);
      }
    } catch (error) {
      console.error('Error updating markers:', error);
    }
  }, [complaints]);

  useEffect(() => {
    // Subscribe to complaints via utility that handles role and formatting
    const unsubscribe = fetchComplaints((updatedComplaints = []) => {
      try {
        // Ensure we always pass an array to DataGrid
        const safe = Array.isArray(updatedComplaints) ? updatedComplaints : [];
        setComplaints(safe);
      } catch (e) {
        console.error('Error updating complaints state:', e);
        setComplaints([]);
      } finally {
        setIsLoading(false);
      }
    }, 'citizen');

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    inProgress: 'bg-blue-100 text-blue-800',
    solved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const statusLabels = {
    pending: 'Pending',
    inProgress: 'In Progress',
    solved: 'Solved',
    rejected: 'Rejected',
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'reason', headerName: 'Complaint', width: 200 },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 130,
      renderCell: (params) => (
        <span 
          className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[params.value] || 'bg-gray-100 text-gray-800'}`}
        >
          {statusLabels[params.value] || params.value}
        </span>
      ),
    },
    { 
      field: 'timestamp', 
      headerName: 'Date', 
      width: 200,
      valueFormatter: (params) => new Date(params.value).toLocaleString(),
    },
  ];

  const handleRowClick = (params) => {
    setSelectedComplaint(params.row);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return <SpinnerModal visible={true} />;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Track Complaints</h1>
      
      {/* Map Container */}
      <div className="relative w-full h-[600px] mb-6 rounded-lg overflow-hidden shadow-lg">
        <div 
          id="map-container"
          ref={mapContainerRef}
          className="absolute inset-0 w-full h-full"
          style={{
            minHeight: '400px',
            zIndex: 1,
            backgroundColor: '#f0f0f0'
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium">Loading map...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complaints Table */}
      <div className="bg-white rounded-lg shadow p-4">
        <DataGrid
          rows={complaints}
          columns={columns}
          pageSize={10}
          onRowClick={handleRowClick}
          className="border-0"
          disableSelectionOnClick
          autoHeight
        />
      </div>

      {/* Complaint Detail Modal */}
      {selectedComplaint && (
        <ComplaintDetailModal
          open={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedComplaint(null);
          }}
          complaint={selectedComplaint}
          onStatusUpdate={updateComplaintStatus}
        />
      )}
    </div>
  );
};

export default TrackComplaints;
