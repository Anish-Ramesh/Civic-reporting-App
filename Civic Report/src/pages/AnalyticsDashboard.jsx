import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Typography, Paper, Grid, CircularProgress, 
  FormControl, InputLabel, Select, MenuItem,
  Button, Container, Alert, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Chip, Card, CardContent, Divider, useTheme
} from '@mui/material';
import { 
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, LineChart, Line, Label,
  ComposedChart, Area, RadialBarChart, RadialBar, Scatter, ScatterChart, ZAxis
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { Statuses, statusColors } from '../utils/enums';
import { fetchComplaints, subscribeToComplaints } from '../utils/FirebaseFunctions';
import { saveAs } from 'file-saver';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DescriptionIcon from '@mui/icons-material/Description';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

// Stat Card Component
const StatCard = ({ title, value, color, icon: Icon, isLoading = false }) => (
  <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            {title}
          </Typography>
          {isLoading ? (
            <Box height={36} display="flex" alignItems="center">
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Typography variant="h4" component="div" fontWeight="bold" color={color}>
              {value}
            </Typography>
          )}
        </Box>
        {Icon && (
          <Box
            sx={{
              backgroundColor: `${color}15`,
              width: 48,
              height: 48,
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color
            }}
          >
            <Icon fontSize="medium" />
          </Box>
        )}
      </Box>
    </CardContent>
  </Card>
);

// Chart Card Component
const ChartCard = ({ title, subtitle, children, action, sx = {} }) => (
  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2, boxShadow: 1, ...sx }}>
    <CardContent sx={{ flexGrow: 1, p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
        <Box>
          <Typography variant="h6" component="h2" gutterBottom={!subtitle}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="textSecondary" gutterBottom>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action && <Box>{action}</Box>}
      </Box>
      <Box sx={{ height: '100%', minHeight: 300 }}>
        {children}
      </Box>
    </CardContent>
  </Card>
);

// Custom color palette
const CHART_COLORS = {
  primary: '#4361ee',
  secondary: '#3f37c9',
  success: '#4cc9f0',
  warning: '#f72585',
  error: '#f72585',
  info: '#4895ef',
  background: '#f8f9fa',
  text: '#212529',
  border: '#dee2e6'
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <Paper elevation={3} sx={{ p: 2, backgroundColor: 'rgba(255, 255, 255, 0.95)' }}>
        <Typography variant="body2" color="textSecondary">{label}</Typography>
        {payload.map((entry, index) => (
          <Box key={`tooltip-${index}`} sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
            <Box sx={{ width: 12, height: 12, backgroundColor: entry.color, mr: 1, borderRadius: '2px' }} />
            <Typography variant="body2">
              {entry.name}: <strong>{entry.value}</strong>
            </Typography>
          </Box>
        ))}
      </Paper>
    );
  }
  return null;
};

// Custom legend component
const renderCustomizedLegend = (props) => {
  const { payload } = props;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      {payload.map((entry, index) => (
        <Box key={`legend-${index}`} sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <Box sx={{ width: 12, height: 12, backgroundColor: entry.color, mr: 1, borderRadius: '2px' }} />
          <Typography variant="caption">{entry.value}</Typography>
        </Box>
      ))}
    </Box>
  );
};

const AnalyticsDashboard = () => {
  const theme = useTheme();
  const { currentUser, isOfficial } = useAuth();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30');
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isMounted, setIsMounted] = useState(true);
  
  // Memoize the filtered complaints based on time range
  const filteredComplaints = useMemo(() => {
    if (!complaints.length) return [];
    
    const today = new Date();
    let startDate;
    switch (timeRange) {
      case '7': startDate = subDays(today, 7); break;
      case '30': startDate = subDays(today, 30); break;
      case '90': startDate = subDays(today, 90); break;
      case '365': startDate = subDays(today, 365); break;
      default: startDate = new Date(0);
    }
    
    return complaints.filter(c => {
      if (!c?.timestamp) return false;
      const date = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
      return !isNaN(date) && date >= startDate;
    });
  }, [complaints, timeRange]);

  // Fetch complaints data with error handling and cleanup
  useEffect(() => {
    let unsubscribe = null;

    const loadComplaints = async () => {
      if (!isMounted) return;
      
      try {
        setLoading(true);
        setError(null);
        
        console.log('Fetching complaints...');
        const allComplaints = await fetchComplaints();
        
        if (!isMounted) return;
        
        // Ensure all required fields are present and valid
        const validComplaints = allComplaints.filter(c => {
          try {
            return c?.id && 
                   c?.timestamp && 
                   c?.status &&
                   (c.timestamp instanceof Date || !isNaN(new Date(c.timestamp).getTime()));
          } catch (err) {
            console.warn('Invalid complaint data:', c, err);
            return false;
          }
        });
        
        console.log(`Loaded ${validComplaints.length} valid complaints out of ${allComplaints.length}`);
        setComplaints(validComplaints);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Error loading complaints:', err);
        if (isMounted) {
          setError('Failed to load complaints. Please refresh the page or try again later.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Set up real-time updates
    const setupRealtimeUpdates = async () => {
      try {
        console.log('Setting up real-time updates...');
        unsubscribe = subscribeToComplaints((updatedComplaints) => {
          if (!isMounted) return;
          
          const validComplaints = updatedComplaints.filter(c => 
            c?.id && c?.timestamp && c?.status
          );
          console.log('Received real-time update with', validComplaints.length, 'valid complaints');
          setComplaints(validComplaints);
          setLastUpdated(new Date());
        });
      } catch (err) {
        console.error('Error setting up real-time updates:', err);
        if (isMounted) {
          setError('Failed to set up real-time updates. Some data may be outdated.');
        }
      }
    };

    loadComplaints();
    setupRealtimeUpdates();

    // Cleanup function
    return () => {
      setIsMounted(false);
      if (unsubscribe && typeof unsubscribe === 'function') {
        console.log('Cleaning up real-time listener');
        unsubscribe();
      }
    };
  }, [isMounted]);

  // Process data for charts
  // Derive a normalized issue type from various fields
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
    for (const cat of map) {
      if (cat.kws.some(k => text.includes(k))) return cat.name;
    }
    return 'Other';
  };

  const chartData = useMemo(() => {
    if (!filteredComplaints.length) return {};
    
    const now = new Date();
    const days = parseInt(timeRange, 10) || 30;

    // 1. Complaints by Status
    const statusCount = filteredComplaints.reduce((acc, complaint) => {
      acc[complaint.status] = (acc[complaint.status] || 0) + 1;
      return acc;
    }, {});
    
    const statusData = Object.entries(Statuses).map(([key, value]) => ({
      name: value,
      value: statusCount[key] || 0,
      color: statusColors[key] || CHART_COLORS.info,
      key
    }));

    // Compute resolution rate (solved divided by processed = total - pending)
    const solvedCount = statusCount['solved'] || 0;
    const pendingCount = statusCount['pending'] || 0;
    const processed = Math.max(0, filteredComplaints.length - pendingCount);
    const resolutionRate = processed > 0 ? Math.round((solvedCount / processed) * 100) : 0;

    // 2. Complaints Over Time (last N days)
    const dateMap = {};
    const dateRange = eachDayOfInterval({
      start: subDays(now, days - 1),
      end: now
    });
    
    dateRange.forEach(date => {
      const dateStr = format(date, 'MMM dd');
      dateMap[dateStr] = 0;
    });
    
    filteredComplaints.forEach(complaint => {
      const dateStr = format(new Date(complaint.timestamp), 'MMM dd');
      if (dateMap[dateStr] !== undefined) {
        dateMap[dateStr]++;
      }
    });
    
    const timeSeriesData = Object.entries(dateMap).map(([date, count]) => ({ date, count }));

    // 2b. Status-over-time (stacked) for key statuses
    const statusKeys = ['pending', 'inProgress', 'solved', 'rejected'];
    const statusDateMap = {};
    dateRange.forEach(date => {
      const dateStr = format(date, 'MMM dd');
      statusDateMap[dateStr] = Object.fromEntries(statusKeys.map(k => [k, 0]));
    });
    filteredComplaints.forEach(complaint => {
      const dateStr = format(new Date(complaint.timestamp), 'MMM dd');
      if (statusDateMap[dateStr]) {
        const k = complaint.status || 'pending';
        if (statusKeys.includes(k)) statusDateMap[dateStr][k] += 1;
      }
    });
    const statusOverTime = Object.entries(statusDateMap).map(([date, obj]) => ({ date, ...obj }));

    // 3. Complaints by Issue Type
    const issueTypeCount = filteredComplaints.reduce((acc, complaint) => {
      const type = deriveIssueType(complaint);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    const issueTypeData = Object.entries(issueTypeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) // Top 8 issue types
      .map(([name, value]) => ({
        name: name.length > 15 ? `${name.substring(0, 15)}...` : name,
        value,
        fullName: name
      }));

    // 4. Status Distribution by Issue Type
    const statusByIssueType = {};
    filteredComplaints.forEach(complaint => {
      const type = deriveIssueType(complaint);
      if (!statusByIssueType[type]) {
        statusByIssueType[type] = {};
      }
      statusByIssueType[type][complaint.status] = (statusByIssueType[type][complaint.status] || 0) + 1;
    });
    
    const statusByIssueData = Object.entries(statusByIssueType).map(([issueType, statusCounts]) => ({
      name: issueType,
      ...Object.entries(Statuses).reduce((acc, [key, status]) => {
        acc[status] = statusCounts[key] || 0;
        return acc;
      }, {})
    }));

    // 5. Top Locations
    const locationCount = filteredComplaints.reduce((acc, c) => {
      const loc = c.location?.name || c.location?.address || 'Unknown';
      acc[loc] = (acc[loc] || 0) + 1;
      return acc;
    }, {});
    const topLocations = Object.entries(locationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    // 6. Recent Complaints
    const recentComplaints = [...filteredComplaints]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);

    return {
      statusData,
      timeSeriesData,
      statusOverTime,
      issueTypeData,
      statusByIssueData,
      topLocations,
      recentComplaints,
      stats: {
        pending: statusCount['pending'] || 0,
        inProgress: statusCount['inProgress'] || 0,
        solved: statusCount['solved'] || 0,
        rejected: statusCount['rejected'] || 0,
        total: filteredComplaints.length,
        resolutionRate
      }
    };
  }, [filteredComplaints, timeRange]);

  // Handle data refresh
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const allComplaints = await fetchComplaints();
      setComplaints(allComplaints);
      setLastUpdated(new Date());
      toast.success('Data refreshed successfully');
    } catch (err) {
      console.error('Error refreshing data:', err);
      toast.error('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };


  // Export chart data as CSV
  const exportChart = (chartType) => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      let dataToExport = [];
      let fileName = '';

      switch (chartType) {
        case 'status':
          dataToExport = chartData.statusData.map(item => ({
            Status: item.name,
            Count: item.value,
            Percentage: `${((item.value / chartData.stats.total) * 100).toFixed(1)}%`
          }));
          fileName = 'complaints_by_status';
          break;
        case 'timeSeries':
          dataToExport = chartData.timeSeriesData.map(item => ({
            Date: item.date,
            'Number of Complaints': item.count
          }));
          fileName = 'complaints_over_time';
          break;
        case 'issueTypes':
          dataToExport = chartData.issueTypeData.map(item => ({
            'Issue Type': item.fullName || item.name,
            Count: item.value
          }));
          fileName = 'complaints_by_issue_type';
          break;
        case 'statusByIssue':
          dataToExport = [];
          chartData.statusByIssueData.forEach(item => {
            const row = { 'Issue Type': item.name };
            Object.keys(Statuses).forEach(status => {
              if (item[status] !== undefined) {
                row[Statuses[status]] = item[status];
              }
            });
            dataToExport.push(row);
          });
          fileName = 'status_distribution_by_issue_type';
          break;
        default:
          return;
      }

      // Add headers
      const headers = Object.keys(dataToExport[0] || {});
      csvContent += headers.join(',') + '\r\n';

      // Add data rows
      dataToExport.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma or quote
          const escaped = ('' + value).replace(/"/g, '\\"');
          return `"${escaped}"`;
        });
        csvContent += values.join(',') + '\r\n';
      });

      // Create download link
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${fileName}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Data exported successfully');
    } catch (err) {
      console.error('Error exporting data:', err);
      toast.error('Failed to export data');
    }
  };

  // redirect protection
  useEffect(() => {
    if (!currentUser) {
      setAccessDenied(true);
      toast.error('Please log in to access the analytics dashboard');
      navigate('/official-login');
    } else if (!isOfficial) {
      setAccessDenied(true);
      toast.error('You do not have permission to access this page');
      navigate('/');
    }
  }, [currentUser, isOfficial, navigate]);

  if (accessDenied) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          You do not have permission to access the analytics dashboard.
        </Alert>
        <Button variant="contained" color="primary" onClick={() => navigate('/')}>
          Return to Home
        </Button>
      </Container>
    );
  }

  // Render loading state with skeleton
  if (loading) {
    return (
      <Box p={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box>
            <Box width={300} height={48} bgcolor="#f0f2f5" borderRadius={1} mb={1} />
            <Box width={200} height={24} bgcolor="#f0f2f5" borderRadius={1} />
          </Box>
          <Box display="flex" gap={2}>
            <Box width={150} height={40} bgcolor="#f0f2f5" borderRadius={1} />
            <Box width={120} height={40} bgcolor="#f0f2f5" borderRadius={1} />
          </Box>
        </Box>
        
        <Grid container spacing={3} mb={4}>
          {[1, 2, 3, 4].map((item) => (
            <Grid item xs={12} sm={6} md={3} key={item}>
              <Box bgcolor="#fff" p={3} borderRadius={2} boxShadow="0 2px 12px rgba(0,0,0,0.05)">
                <Box width="60%" height={24} bgcolor="#f0f2f5" mb={2} borderRadius={1} />
                <Box width="40%" height={40} bgcolor="#f0f2f5" borderRadius={1} />
              </Box>
            </Grid>
          ))}
        </Grid>
        
        <Grid container spacing={3}>
          {[1, 2].map((item) => (
            <Grid item xs={12} md={6} key={item}>
              <Box bgcolor="#fff" p={3} borderRadius={2} boxShadow="0 2px 12px rgba(0,0,0,0.05)" height={400}>
                <Box width={200} height={28} bgcolor="#f0f2f5" mb={3} borderRadius={1} />
                <Box width="100%" height="calc(100% - 60px)" bgcolor="#f8f9fa" borderRadius={1} />
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Render error state with improved UI
  if (error) {
    return (
      <Box p={3}>
        <Box 
          maxWidth={800} 
          mx="auto" 
          textAlign="center" 
          mt={8} 
          p={4} 
          bgcolor="#fff" 
          borderRadius={2} 
          boxShadow="0 2px 12px rgba(0,0,0,0.05)"
        >
          <Box 
            fontSize={64} 
            color="error.main" 
            mb={2}
            sx={{
              animation: 'bounce 2s infinite',
              '@keyframes bounce': {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-10px)' },
              },
            }}
          >
            ⚠️
          </Box>
          <Typography variant="h5" color="error" gutterBottom>
            Oops! Something went wrong
          </Typography>
          <Typography color="text.secondary" paragraph sx={{ maxWidth: 600, mx: 'auto' }}>
            {error}
          </Typography>
          <Box display="flex" gap={2} justifyContent="center" mt={3}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={handleRefresh}
              startIcon={<RefreshIcon />}
              sx={{
                textTransform: 'none',
                px: 3,
                py: 1,
                boxShadow: '0 2px 8px rgba(67, 97, 238, 0.3)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(67, 97, 238, 0.4)',
                },
              }}
            >
              Try Again
            </Button>
            <Button 
              variant="outlined" 
              onClick={() => window.location.reload()}
              sx={{
                textTransform: 'none',
                borderColor: 'rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'rgba(67, 97, 238, 0.04)',
                },
              }}
            >
              Reload Page
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  // Use chartData for all derived data
  const { 
    issueTypeData = [], 
    statusData = [], 
    stats: summaryMetrics = { 
      total: 0, 
      solved: 0, 
      inProgress: 0, 
      rejected: 0, 
      resolutionRate: 0 
    } 
  } = chartData;

  // export data (lazy-load ExcelJS)
  const handleExport = async () => {
    try {
      if (!filteredComplaints.length) {
        toast.warn('No data to export');
        return;
      }
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Complaints');

      const exportData = filteredComplaints.map(c => ({
        'Issue Type': c.issueType || 'N/A',
        'Status': c.status || 'N/A',
        'Date': c.timestamp?.toDate ? format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : format(new Date(c.timestamp), 'yyyy-MM-dd HH:mm'),
        'Location': c.location?.address || 'N/A',
        'Description': c.description || '',
        'ID': c.id || 'N/A',
        'Author': c.author || 'Unknown'
      }));

      worksheet.addRow(Object.keys(exportData[0]));
      exportData.forEach(row => worksheet.addRow(Object.values(row)));

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `complaints_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      toast.success('Export completed!');
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    }
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} thickness={4} sx={{ mb: 2 }} />
        <Typography variant="h6" color="textSecondary">Loading analytics data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} textAlign="center">
        <Typography variant="h5" color="error" gutterBottom>Error Loading Data</Typography>
        <Typography color="textSecondary" paragraph>{error}</Typography>
        <Button variant="outlined" onClick={() => window.location.reload()} startIcon={<RefreshIcon />}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!filteredComplaints.length) {
    return (
      <Box p={3}>
        <Box 
          maxWidth={600} 
          mx="auto" 
          textAlign="center" 
          mt={8} 
          p={4} 
          bgcolor="#fff" 
          borderRadius={2} 
          boxShadow="0 2px 12px rgba(0,0,0,0.05)"
        >
          <Box 
            fontSize={64} 
            color="text.secondary" 
            mb={2}
            sx={{
              opacity: 0.8,
              transform: 'scale(1.2)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'scale(1.3) rotate(5deg)',
                opacity: 1,
              },
            }}
          >
            📊
          </Box>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            No Data Available
          </Typography>
          <Typography color="text.secondary" paragraph sx={{ maxWidth: 500, mx: 'auto', mb: 3 }}>
            We couldn't find any complaints for the selected time period. Try adjusting the time range or check back later.
          </Typography>
          <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
            <Button 
              variant="contained" 
              onClick={() => setTimeRange('all')}
              startIcon={<HourglassEmptyIcon />}
              sx={{
                textTransform: 'none',
                px: 3,
                py: 1,
                boxShadow: '0 2px 8px rgba(67, 97, 238, 0.3)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(67, 97, 238, 0.4)',
                },
              }}
            >
              View All Time
            </Button>
            <Button 
              variant="outlined" 
              onClick={handleRefresh}
              startIcon={<RefreshIcon />}
              sx={{
                textTransform: 'none',
                borderColor: 'rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'rgba(67, 97, 238, 0.04)',
                },
              }}
            >
              Refresh Data
            </Button>
          </Box>
          <Box mt={4} pt={3} borderTop="1px solid" borderColor="divider">
            <Typography variant="caption" color="text.secondary">
              Last updated: {format(lastUpdated, 'MMM d, yyyy h:mm a')}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4">Analytics Dashboard</Typography>
          <Typography variant="subtitle1" color="textSecondary">
            {timeRange === 'all' ? 'All Time Data' : `Last ${timeRange} days`}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Time Range</InputLabel>
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} label="Time Range">
              <MenuItem value="7">Last 7 days</MenuItem>
              <MenuItem value="30">Last 30 days</MenuItem>
              <MenuItem value="90">Last 90 days</MenuItem>
              <MenuItem value="365">Last year</MenuItem>
              <MenuItem value="all">All time</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={handleExport}>Export Data</Button>
        </Box>
      </Box>

      {/* summary (StatCards) */}
      {summaryMetrics && (
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Complaints" value={summaryMetrics.total} color={CHART_COLORS.primary} icon={DescriptionIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Resolved" value={summaryMetrics.solved} color={statusColors.solved || '#10b981'} icon={CheckCircleOutlineIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="In Progress" value={summaryMetrics.inProgress} color={statusColors.inProgress || '#f59e0b'} icon={PendingActionsIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Resolution Rate" value={`${summaryMetrics.resolutionRate || 0}%`} color={CHART_COLORS.success} icon={HourglassEmptyIcon} />
          </Grid>
        </Grid>
      )}

      {/* charts (issue type, status, trends) */}
      <Grid container spacing={3}>
        {/* Status Distribution Pie Chart */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Complaints by Status" action={
            <Button size="small" onClick={() => handleExport('status')}>
              Export
            </Button>
          }>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS.primary} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Issue Type Distribution */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Complaints by Issue Type" action={
            <Button size="small" onClick={() => handleExport('issueType')}>
              Export
            </Button>
          }>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={issueTypeData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill={CHART_COLORS.primary} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Complaints Over Time */}
        <Grid item xs={12}>
          <ChartCard 
            title="Complaints Over Time" 
            subtitle={`Last ${timeRange} days`}
            action={
              <Button size="small" onClick={() => handleExport('timeSeries')}>
                Export
              </Button>
            }
          >
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={chartData.timeSeriesData || []}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Number of Complaints"
                  stroke={CHART_COLORS.primary}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Status Over Time (Stacked) */}
        <Grid item xs={12}>
          <ChartCard 
            title="Status Over Time" 
            subtitle={`Stacked distribution across ${timeRange === 'all' ? 'all time' : `last ${timeRange} days`}`}
          >
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={chartData.statusOverTime || []} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="pending" stackId="1" name="Pending" fill="#3b82f6" stroke="#3b82f6" />
                <Area type="monotone" dataKey="inProgress" stackId="1" name="In Progress" fill="#f59e0b" stroke="#f59e0b" />
                <Area type="monotone" dataKey="solved" stackId="1" name="Solved" fill="#10b981" stroke="#10b981" />
                <Area type="monotone" dataKey="rejected" stackId="1" name="Rejected" fill="#ef4444" stroke="#ef4444" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        {/* Top Locations and Recent Complaints */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Top Locations by Complaints">
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Location</TableCell>
                    <TableCell align="right">Complaints</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(chartData.topLocations || []).map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell align="right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <ChartCard 
            title="Recent Complaints"
            action={
              <Button size="small" onClick={() => handleExport('recent')}>
                Export
              </Button>
            }
          >
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Issue Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Location</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chartData.recentComplaints?.slice(0, 5).map((complaint) => (
                    <TableRow key={complaint.id} hover>
                      <TableCell>
                        {format(new Date(complaint.timestamp), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>{complaint.issueType || 'N/A'}</TableCell>
                      <TableCell>
                        <Chip 
                          label={complaint.status} 
                          size="small"
                          color={
                            complaint.status === 'solved' ? 'success' : 
                            complaint.status === 'inProgress' ? 'warning' : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell>{complaint.location?.name || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </ChartCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AnalyticsDashboard;
