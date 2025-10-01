import React, { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Grid, Card, CardContent, CardActions, Button, Chip } from '@mui/material';
import ComplaintDetailModal from '../components/ComplaintDetailModal';
import { fetchComplaints } from '../utils/FirebaseFunctions.jsx';
import { db } from '../utils/Firebase';
import { doc, updateDoc } from 'firebase/firestore';

const OfficialPriority = () => {
  const [complaints, setComplaints] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = fetchComplaints((updated) => {
      if (!isMounted) return;
      const processed = (updated || []).map(c => ({ ...c, priority: derivePriority(c) }));
      setComplaints(processed);
    }, 'official');
    return () => { isMounted = false; if (unsubscribe) unsubscribe(); };
  }, []);

  const derivePriority = (c) => {
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

  const handleRowClick = useCallback((item) => {
    setSelectedComplaint(item);
    setModalOpen(true);
  }, []);

  const handleModalStatusUpdate = async (complaintId, status) => {
    if (!complaintId) return;
    try {
      setUpdatingStatus(true);
      const complaintRef = doc(db, 'complaints', complaintId);
      await updateDoc(complaintRef, { status });
      setComplaints(prev => prev.map(c => c.id === complaintId ? { ...c, status } : c));
      setSelectedComplaint(prev => (prev?.id === complaintId ? { ...prev, status } : prev));
    } catch (e) {
      console.error('Error updating status from modal:', e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const groups = { High: [], Medium: [], Low: [] };
  (complaints || []).forEach(c => {
    const p = c.priority || 'Low';
    groups[p] = groups[p] || [];
    groups[p].push(c);
  });
  const order = ['High', 'Medium', 'Low'];
  const chipColor = { High: 'error', Medium: 'warning', Low: 'success' };

  return (
    <div className="min-h-screen w-full p-4 md:p-8 bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Priority Overview</h1>
      </div>

      <Grid container spacing={2}>
        {order.map(group => (
          <Grid item xs={12} md={4} key={group}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="h6">{group} Priority</Typography>
              <Chip label={`${groups[group]?.length || 0}`} color={chipColor[group]} size="small" />
            </Box>
            <Grid container spacing={2}>
              {(groups[group] || []).slice(0, 12).map(item => (
                <Grid item xs={12} key={item.id}>
                  <Card variant="outlined" sx={{
                    borderLeft: '4px solid',
                    borderLeftColor: group === 'High' ? 'error.main' : group === 'Medium' ? 'warning.main' : 'success.main',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 }
                  }}>
                    <CardContent sx={{ pb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600} noWrap>
                        {item.reason || 'Issue'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {item.description || ''}
                      </Typography>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                        <Typography variant="caption" color="text.secondary">
                          {item.author || 'Unknown'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {(() => { try { const d = new Date(item.timestamp); return d.toLocaleDateString(); } catch { return 'N/A'; } })()}
                        </Typography>
                      </Box>
                    </CardContent>
                    <CardActions sx={{ pt: 0, pb: 1, px: 2 }}>
                      <Button size="small" onClick={() => handleRowClick(item)}>View</Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
              {(groups[group] || []).length === 0 && (
                <Grid item xs={12}>
                  <Box py={4} textAlign="center" color="text.secondary">No items</Box>
                </Grid>
              )}
            </Grid>
          </Grid>
        ))}
      </Grid>

      <ComplaintDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        complaint={selectedComplaint || {}}
        onStatusUpdate={handleModalStatusUpdate}
      />
    </div>
  );
};

export default OfficialPriority;
