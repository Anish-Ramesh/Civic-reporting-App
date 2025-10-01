import { Box, Typography, CircularProgress, Button, Menu, MenuItem, ListItemIcon, ListItemText, Chip, IconButton } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import clsx from "clsx";
import React, { useEffect, useState, useCallback, lazy, Suspense, useMemo } from "react";
import ComplaintDetailModal from "../components/ComplaintDetailModal";
import SpinnerModal from "../components/SpinnerModal";
import { fetchComplaints, subscribeToComplaints } from "../utils/FirebaseFunctions.jsx";
import { db } from "../utils/Firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Statuses, statusColors } from "../utils/enums";
import { CheckCircle, Pending, HourglassEmpty, Cancel, Warning, MyLocation, Send } from "@mui/icons-material";

// Use Vite's dynamic import with React.lazy
const ComplaintsMap = lazy(() => import('../components/ComplaintsMap'));

// Loading component for Suspense fallback
const MapLoadingFallback = () => (
  <Box 
    sx={{ 
      height: '400px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      bgcolor: 'background.paper',
      borderRadius: 1,
      boxShadow: 1
    }}
  >
    <Box textAlign="center">
      <CircularProgress />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Loading map...
      </Typography>
    </Box>
  </Box>
);

const OfficialDashboard = () => {
  const [complaints, setComplaints] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState({});
  const [spinnerVisible, setSpinnerVisible] = useState(true);
  const [selectedComplaintId, setSelectedComplaintId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | inProgress | solved | rejected | overdue
  const [sortKey, setSortKey] = useState('newest'); // newest | oldest | status | hasMedia | dueSoon
  const [departmentFilter, setDepartmentFilter] = useState('all'); // all or one of departments below
  
  // Status update menu state
  const [statusAnchorEl, setStatusAnchorEl] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusMenuComplaint, setStatusMenuComplaint] = useState(null);
  const statusMenuOpen = Boolean(statusAnchorEl);
  
  // Status menu handlers
  const handleStatusMenuOpen = (event, complaint) => {
    setStatusAnchorEl(event.currentTarget);
    setStatusMenuComplaint(complaint);
  };

  const handleStatusMenuClose = () => {
    setStatusAnchorEl(null);
    setStatusMenuComplaint(null);
  };
  
  // Update complaint status
  const updateComplaintStatus = async (status) => {
    if (!statusMenuComplaint) return;
    
    try {
      setUpdatingStatus(true);
      const complaintRef = doc(db, 'complaints', statusMenuComplaint.id);
      await updateDoc(complaintRef, { status });
      
      // Update local state
      setComplaints(prevComplaints => 
        prevComplaints.map(complaint => 
          complaint.id === statusMenuComplaint.id 
            ? { ...complaint, status }
            : complaint
        )
      );
      
      handleStatusMenuClose();
    } catch (error) {
      console.error('Error updating status:', error);
      // Handle error (you might want to show a snackbar/notification)
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Set up real-time subscription for officials
    const unsubscribe = fetchComplaints((updatedComplaints) => {
      if (isMounted) {
        handleComplaintsUpdate(updatedComplaints);
        setSpinnerVisible(false);
      }
    }, 'official'); // Pass 'official' as the user role
    
    return () => {
      isMounted = false;
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleComplaintsUpdate = (updatedComplaints) => {
    // Process complaints to ensure location data is in the correct format
    const getPriorityFromHeuristic = (c) => {
      // If server/model already provided a numeric/string priority, normalize it
      if (c.priority != null) {
        const p = String(c.priority).toLowerCase();
        if (p.includes('high') || p === '2' || p === '3' || p === 'urgent') return 'High';
        if (p.includes('medium') || p === '1') return 'Medium';
        if (p.includes('low') || p === '0') return 'Low';
      }
      const text = `${c.reason || ''} ${c.description || ''}`.toLowerCase();
      const highKw = ['urgent', 'emergency', 'accident', 'fire', 'flood', 'collapsed', 'contaminated', 'gas leak', 'electric shock', 'blocked road'];
      const medKw = ['traffic', 'signal', 'garbage', 'pothole', 'water leak', 'sewage', 'overflow', 'streetlight'];
      if (highKw.some(k => text.includes(k))) return 'High';
      if (medKw.some(k => text.includes(k))) return 'Medium';
      return 'Low';
    };

    const processedComplaints = updatedComplaints.map(complaint => {
      // If location is a string, try to parse it
      if (typeof complaint.location === 'string') {
        try {
          complaint.location = JSON.parse(complaint.location);
        } catch (e) {
          console.warn('Failed to parse location string:', complaint.location);
          complaint.location = null;
        }
      }
      
      // Ensure location has lat/lng properties if coordinates exist
      if (complaint.location?.coordinates) {
        if (complaint.location.coordinates.latitude !== undefined) {
          // Convert from { latitude, longitude } to { lat, lng }
          complaint.location = {
            ...complaint.location,
            lat: parseFloat(complaint.location.coordinates.latitude),
            lng: parseFloat(complaint.location.coordinates.longitude)
          };
        } else if (Array.isArray(complaint.location.coordinates)) {
          // Convert from [lng, lat] to { lat, lng }
          complaint.location = {
            ...complaint.location,
            lat: parseFloat(complaint.location.coordinates[1]),
            lng: parseFloat(complaint.location.coordinates[0])
          };
        }
      }
      
      // Derive priority (fallback heuristic if not already present)
      const priority = getPriorityFromHeuristic(complaint);
      return { ...complaint, priority };
    });
    
    setComplaints(processedComplaints);
  };

  const handleMarkerClick = useCallback((complaintId) => {
    const complaint = complaints.find(c => c.id === complaintId);
    if (complaint) {
      const normalized = normalizeComplaintForModal(complaint);
      setSelectedComplaint(normalized);
      setSelectedComplaintId(complaintId);
      setModalOpen(true);
    }
  }, [complaints]);

  const handleRowClick = (params) => {
    const normalized = normalizeComplaintForModal(params.row);
    setSelectedComplaint(normalized);
    setSelectedComplaintId(params.row.id);
    // Ensure no focused element remains in the grid before opening dialog
    if (typeof document !== 'undefined' && document.activeElement) {
      try { document.activeElement.blur(); } catch (_) {}
    }
    setModalOpen(true);
  };

  // Ensure modal has consistent media/audio fields
  const normalizeComplaintForModal = (c) => {
    const mediaUrl = c.mediaUrl || c.mediaPath || c.imageUrl || '';
    const audioUrl = c.audioUrl || c.audioPath || '';
    return { ...c, mediaUrl, audioUrl };
  };

  // Status update from modal (by complaintId)
  const handleModalStatusUpdate = async (complaintId, status) => {
    if (!complaintId) return;
    try {
      setUpdatingStatus(true);
      const complaintRef = doc(db, 'complaints', complaintId);
      await updateDoc(complaintRef, { status });
      // Update local state
      setComplaints(prev => prev.map(c => c.id === complaintId ? { ...c, status } : c));
      // Also update selected complaint if it's the same
      setSelectedComplaint(prev => (prev?.id === complaintId ? { ...prev, status } : prev));
    } catch (e) {
      console.error('Error updating status from modal:', e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const columns = [
    {
      field: "locate",
      headerName: "Locate",
      width: 80,
      sortable: false,
      filterable: false,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <IconButton
          aria-label="Locate on map"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            focusComplaintOnMap(params.row?.id);
          }}
        >
          <MyLocation fontSize="small" />
        </IconButton>
      )
    },
    {
      field: "reason",
      headerName: "Complaint Reason",
      width: 300,
      headerClassName: "",
    },
    {
      field: 'department',
      headerName: 'Department',
      width: 180,
      headerAlign: 'center',
      align: 'center',
      sortable: true,
      valueGetter: (params) => getDepartment(params.row),
      renderCell: (params) => (
        <Chip size="small" label={params.value || 'Other'} variant="outlined" />
      ),
    },
    {
      field: "dueBy",
      headerName: "Due By",
      width: 140,
      headerAlign: 'center',
      align: 'center',
      sortable: false,
      valueGetter: (params) => getDueDate(params.row),
      renderCell: (params) => {
        const row = params.row;
        const due = getDueDate(row);
        if (!due) return <span className="text-gray-400">N/A</span>;
        const overdue = isOverdue(row);
        const cls = overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
        return (
          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${cls}`}>{formatShort(due)}</span>
        );
      }
    },
    {
      field: "priority",
      headerName: "Priority",
      width: 120,
      headerAlign: 'center',
      align: 'center',
      sortable: true,
      renderCell: (params) => {
        const p = params.value || 'Low';
        const colorMap = { High: 'error', Medium: 'warning', Low: 'success' };
        return (
          <Chip size="small" label={p} color={colorMap[p] || 'default'} variant="outlined" />
        );
      }
    },
    {
      field: "author",
      headerName: "Reported By",
      width: 150,
    },
    {
      field: "location",
      headerName: "Reported Location",
      width: 200,
      valueGetter: (params) => `${params.row.location?.name || 'N/A'}`,
    },
    {
      field: "timestamp",
      headerName: "Reported Date & Time",
      width: 200,
      valueGetter: (params) => {
        if (!params.row.timestamp) return 'N/A';
        let d = new Date(params.row.timestamp);
        let date = d.toLocaleDateString();
        let time = d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
          hour12: true,
        });
        return date + " , " + time;
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 200,
      headerClassName: "",
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const status = params.value || 'pending';
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);
        const statusColor = {
          pending: '#3b82f6',    // blue-500
          inProgress: '#f59e0b', // amber-500
          solved: '#10b981',     // emerald-500
          rejected: '#ef4444',   // red-500
        }[status] || '#9ca3af';  // gray-400
        
        return (
          <div className="flex items-center justify-center w-full">
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusMenuOpen(e, params.row);
              }}
              sx={{
                textTransform: 'none',
                borderColor: statusColor,
                color: statusColor,
                '&:hover': {
                  borderColor: statusColor,
                  backgroundColor: `${statusColor}10`,
                },
                width: '100%',
                maxWidth: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 12px',
              }}
              disabled={updatingStatus}
            >
              <span className="truncate">{statusText}</span>
              {updatingStatus && statusMenuComplaint?.id === params.row.id ? (
                <CircularProgress size={16} sx={{ ml: 1 }} />
              ) : (
                <span className="ml-1">▼</span>
              )}
            </Button>
          </div>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          aria-label="Escalate"
          size="small"
          onClick={(e) => { e.stopPropagation(); handleEscalate(params.row); }}
          title="Escalate via email"
        >
          <Send fontSize="small" />
        </IconButton>
      )
    },
  ];

  // Focus a complaint on the map by dispatching an event and scrolling to map
  const focusComplaintOnMap = (complaintId) => {
    if (!complaintId) return;
    try {
      window.dispatchEvent(new CustomEvent('focus-complaint', { detail: complaintId }));
      const el = document.getElementById('complaints-map');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error('Failed to focus complaint on map', e);
    }
  };

  // Derive issue type (similar to analytics)
  const deriveIssueType = (c) => {
    const direct = c.issueType || c.category || c.type;
    if (direct && String(direct).trim()) return String(direct).trim();
    const text = `${c.reason || ''} ${c.description || ''}`.toLowerCase();
    const map = [
      { name: 'Garbage', kws: ['garbage','trash','waste','dump','litter'] },
      { name: 'Roads & Potholes', kws: ['pothole','road','street','asphalt'] },
      { name: 'Water Supply', kws: ['water leak','water supply','pipe','pipeline','tap'] },
      { name: 'Sewage/Drainage', kws: ['sewage','drain','overflow','manhole'] },
      { name: 'Street Lights', kws: ['streetlight','street light','lamp','light not working'] },
      { name: 'Electricity', kws: ['electric','power','transformer','wire','shock'] },
      { name: 'Traffic/Signals', kws: ['traffic','signal','jam','congestion'] },
      { name: 'Public Safety', kws: ['accident','crime','safety','harassment','fire','flood'] },
      { name: 'Health & Sanitation', kws: ['sanitation','cleanliness','mosquito','dengue'] },
    ];
    for (const cat of map) { if (cat.kws.some(k => text.includes(k))) return cat.name; }
    return 'Other';
  };

  // Map ReportComplaint reasons to departments
  // Reasons from ReportComplaint.jsx: Pothole, Garbage, Street Light, Water Leakage, Road Damage, Drainage Issue, Illegal Dumping, Other
  const getDepartment = (c) => {
    const reason = String(c.reason || '').toLowerCase();
    const desc = String(c.description || '').toLowerCase();
    if (reason.includes('pothole') || reason.includes('road damage')) return 'Roads & Potholes';
    if (reason.includes('garbage') || reason.includes('illegal dumping')) return 'Sanitation';
    if (reason.includes('street light')) return 'Street Lights';
    if (reason.includes('water leakage')) return 'Water Supply';
    if (reason.includes('drainage')) return 'Sewage/Drainage';
    // Fallbacks: detect fire/safety in description to map to Public Safety
    if (/(fire|accident|crime|safety|harassment|flood)/i.test(desc)) return 'Public Safety';
    return 'Other';
  };

  // Static departments list for filtering UI
  const departments = [
    'Sanitation',
    'Roads & Potholes',
    'Water Supply',
    'Sewage/Drainage',
    'Street Lights',
    'Public Safety',
    'Other',
  ];

  const getSlaDays = (c) => {
    const pr = String(c.priority || '').toLowerCase();
    const issue = deriveIssueType(c);
    if (/water/i.test(issue)) return 1;
    if (/sewage|drain/i.test(issue)) return 2;
    if (/garbage/i.test(issue)) return 2;
    if (/roads|pothole/i.test(issue)) return 7;
    if (/street/i.test(issue)) return 5;
    if (pr.includes('high')) return 2;
    if (pr.includes('medium')) return 5;
    if (pr.includes('low')) return 10;
    return 5;
  };

  const formatShort = (d) => {
    try { return d?.toLocaleDateString?.(undefined, { month: 'short', day: 'numeric' }) || ''; } catch { return ''; }
  };

  // Helpers
  const toDate = (t) => {
    try { return t?.toDate ? t.toDate() : new Date(t); } catch { return new Date(NaN); }
  };
  const hasMedia = (c) => Boolean(c.mediaPath || c.mediaUrl || c.imageUrl);
  const getDueDate = (c) => {
    const created = toDate(c.timestamp);
    const days = getSlaDays(c);
    if (isNaN(created)) return null;
    const d = new Date(created);
    d.setDate(d.getDate() + days);
    return d;
  };
  const isOverdue = (c) => {
    if ((c.status || '').toLowerCase() === 'solved') return false;
    const due = getDueDate(c);
    if (!due) return false;
    return new Date() > due;
  };
  const handleEscalate = (c) => {
    const issue = deriveIssueType(c);
    const subject = encodeURIComponent(`[Escalation] ${issue} - ${c.reason || 'Complaint'} (#${c.id})`);
    const body = encodeURIComponent(
      `Hello Team,\n\nThis complaint appears overdue or near due based on SLA.\n\n` +
      `Details:\n` +
      `- ID: ${c.id}\n` +
      `- Issue: ${issue}\n` +
      `- Priority: ${c.priority || 'N/A'}\n` +
      `- Status: ${c.status || 'N/A'}\n` +
      `- Reported: ${toDate(c.timestamp)?.toLocaleString?.() || 'N/A'}\n` +
      `- Due By: ${formatShort(getDueDate(c))}\n` +
      `- Location: ${c.location?.name || c.location?.address || 'N/A'}\n\n` +
      `Please review and take action.\n\nThanks.`
    );
    const mail = `mailto:?subject=${subject}&body=${body}`;
    try { window.open(mail, '_blank'); } catch {}
  };

  // Apply filter and sort to complaints
  const displayedRows = useMemo(() => {
    let rows = [...(complaints || [])];
    // Department filter first (derived from reason/description or explicit issueType)
    if (departmentFilter !== 'all') {
      rows = rows.filter(r => getDepartment(r) === departmentFilter);
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        rows = rows.filter(r => isOverdue(r));
      } else {
        rows = rows.filter(r => (r.status || '').toLowerCase() === statusFilter.toLowerCase());
      }
    }
    rows.sort((a, b) => {
      if (sortKey === 'newest') return toDate(b.timestamp) - toDate(a.timestamp);
      if (sortKey === 'oldest') return toDate(a.timestamp) - toDate(b.timestamp);
      if (sortKey === 'status') return (a.status || '').localeCompare(b.status || '');
      if (sortKey === 'hasMedia') return (hasMedia(b) ? 1 : 0) - (hasMedia(a) ? 1 : 0);
      if (sortKey === 'dueSoon') {
        const da = getDueDate(a); const db = getDueDate(b);
        const inval = (d) => !d || isNaN(d);
        if (inval(da) && inval(db)) return 0;
        if (inval(da)) return 1;
        if (inval(db)) return -1;
        return da - db;
      }
      return 0;
    });
    return rows;
  }, [complaints, statusFilter, sortKey, departmentFilter]);

  return (
    <div className="min-h-screen w-full p-4 md:p-8 bg-gray-50">
      <SpinnerModal visible={spinnerVisible} />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Complaints Dashboard</h1>
        <Button
          variant="contained"
          color="warning"
          startIcon={<Warning />}
          onClick={() => window.location.href = '/reported-issues'}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: '8px',
            px: 3,
            py: 1,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            '&:hover': {
              boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
            }
          }}
        >
          View Supicious Reports
        </Button>
      </div>

      

      {/* Map Section */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Complaints Map</h2>
        <Suspense fallback={<MapLoadingFallback />}>
          <div id="complaints-map" className="h-[400px] w-full rounded-md overflow-hidden">
            <ComplaintsMap 
              complaints={displayedRows}
              onMarkerClick={handleMarkerClick}
              className="h-full"
            />
          </div>
        </Suspense>
        
        {/* Map Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span>Pending</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
            <span>In Progress</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span>Solved</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span>Rejected</span>
          </div>
        </div>
      </div>

      {/* Complaints Table */}
      <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
        <h2 className="text-xl font-semibold mb-4">All Complaints</h2>
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-600">Filter:</span>
            {['all','pending','inProgress','solved','rejected','overdue'].map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 rounded-full border text-xs ${statusFilter === f ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-600">Department:</span>
            <button
              onClick={() => setDepartmentFilter('all')}
              className={`px-2.5 py-1 rounded-full border text-xs ${departmentFilter === 'all' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              All
            </button>
            {departments.map(dep => (
              <button
                key={dep}
                onClick={() => setDepartmentFilter(dep)}
                className={`px-2.5 py-1 rounded-full border text-xs ${departmentFilter === dep ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                title={dep}
              >
                {dep}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-600">Sort:</span>
            {[
              { k: 'newest', label: 'Newest' },
              { k: 'oldest', label: 'Oldest' },
              { k: 'status', label: 'Status' },
              { k: 'hasMedia', label: 'Has Media' },
              { k: 'dueSoon', label: 'Due Soon' },
            ].map(s => (
              <button
                key={s.k}
                onClick={() => setSortKey(s.k)}
                className={`px-2.5 py-1 rounded-full border text-xs ${sortKey === s.k ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[500px] w-full">
          <DataGrid
            rows={displayedRows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10]}
            onRowClick={handleRowClick}
            getRowId={(row) => row.id}
            disableSelectionOnClick
            className="border-0"
            loading={spinnerVisible}
            sx={{
              '& .MuiDataGrid-cell:hover': {
                cursor: 'pointer',
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
              },
              '& .overdue-row': {
                backgroundColor: 'rgba(239, 68, 68, 0.05)'
              },
              '& .StatusCol.inProgress': {
                color: statusColors.inProgress,
                fontWeight: 600,
              },
              '& .StatusCol.Solved': {
                color: statusColors.solved,
                fontWeight: 600,
              },
              '& .StatusCol.Rejected': {
                color: statusColors.rejected,
                fontWeight: 600,
              }
            }}
            getRowClassName={(params) => (isOverdue(params.row) ? 'overdue-row' : '')}
          />
        </div>
      </div>
      
      <ComplaintDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        complaint={selectedComplaint}
        onStatusUpdate={handleModalStatusUpdate}
      />
      
      {/* Status Update Menu */}
      <Menu
        anchorEl={statusAnchorEl}
        open={statusMenuOpen}
        onClose={handleStatusMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <MenuItem 
          onClick={() => updateComplaintStatus('pending')}
          selected={statusMenuComplaint?.status === 'pending'}
          disabled={updatingStatus}
        >
          <ListItemIcon>
            <HourglassEmpty fontSize="small" style={{ color: statusColors.pending }} />
          </ListItemIcon>
          <ListItemText>Pending</ListItemText>
        </MenuItem>
        <MenuItem 
          onClick={() => updateComplaintStatus('inProgress')}
          selected={statusMenuComplaint?.status === 'inProgress'}
          disabled={updatingStatus}
        >
          <ListItemIcon>
            <Pending fontSize="small" style={{ color: statusColors.inProgress }} />
          </ListItemIcon>
          <ListItemText>In Progress</ListItemText>
        </MenuItem>
        <MenuItem 
          onClick={() => updateComplaintStatus('solved')}
          selected={statusMenuComplaint?.status === 'solved'}
          disabled={updatingStatus}
        >
          <ListItemIcon>
            <CheckCircle fontSize="small" style={{ color: statusColors.solved }} />
          </ListItemIcon>
          <ListItemText>Solved</ListItemText>
        </MenuItem>
        <MenuItem 
          onClick={() => updateComplaintStatus('rejected')}
          selected={statusMenuComplaint?.status === 'rejected'}
          disabled={updatingStatus}
        >
          <ListItemIcon>
            <Cancel fontSize="small" style={{ color: statusColors.rejected }} />
          </ListItemIcon>
          <ListItemText>Rejected</ListItemText>
        </MenuItem>
      </Menu>
    </div>
  );
};

export default OfficialDashboard;
