import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  CircularProgress, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem,
  Button,
  Container,
  Alert
} from '@mui/material';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isAfter, isBefore } from 'date-fns';
import { Statuses, statusColors } from '../utils/enums';
import { fetchComplaints, subscribeToComplaints } from '../utils/FirebaseFunctions';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const AnalyticsDashboard = () => {
  const { currentUser, isOfficial } = useAuth();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7'); // Default to last 7 days
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Redirect if not authenticated or not an official
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

  // Load complaints data
  useEffect(() => {
    const loadComplaints = async () => {
      try {
        setLoading(true);
        const allComplaints = await fetchComplaints();
        
        // Ensure we have valid complaint data
        const validComplaints = allComplaints.filter(complaint => 
          complaint && 
          complaint.id && 
          complaint.timestamp && 
          complaint.issueType && 
          complaint.status
        );
        
        setComplaints(validComplaints);
        setError(null);
      } catch (err) {
        console.error('Error loading complaints:', err);
        setError('Failed to load complaints data. Please try again later.');
        toast.error('Failed to load complaints data');
      } finally {
        setLoading(false);
      }
    };

    loadComplaints();
    
    // Set up real-time subscription
    const unsubscribe = subscribeToComplaints((updatedComplaints) => {
      const validComplaints = updatedComplaints.filter(complaint => 
        complaint && complaint.id && complaint.timestamp
      );
      setComplaints(validComplaints);
    });

    return () => unsubscribe();
  }, []);

  // Filter complaints based on selected time range
  const filteredComplaints = useMemo(() => {
    if (!complaints.length) return [];
    
    if (timeRange === 'all') return complaints;
    
    const days = parseInt(timeRange, 10);
    const cutoffDate = subDays(new Date(), days);
    
    return complaints.filter(complaint => {
      const complaintDate = new Date(complaint.timestamp.seconds * 1000);
      return complaintDate >= cutoffDate;
    });
  }, [complaints, timeRange]);

  // Prepare data for charts
  const issueTypeData = useMemo(() => {
    const typeCounts = {};
    
    filteredComplaints.forEach(complaint => {
      const type = complaint.issueType || 'Other';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    return Object.entries(typeCounts).map(([name, value]) => ({
      name,
      value,
      color: COLORS[Object.keys(typeCounts).indexOf(name) % COLORS.length]
    }));
  }, [filteredComplaints]);

  const statusData = useMemo(() => {
    const statusCounts = {};
    
    filteredComplaints.forEach(complaint => {
      const status = complaint.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value,
      color: statusColors[name.toLowerCase()] || '#999999'
    }));
  }, [filteredComplaints]);

  // Prepare time series data
  const timeSeriesData = useMemo(() => {
    if (!filteredComplaints.length) return [];
    
    const days = timeRange === 'all' ? 30 : parseInt(timeRange, 10) || 30;
    const dateMap = {};
    const today = new Date();
    
    // Initialize date map with 0 counts
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStr = format(date, 'MMM dd');
      dateMap[dateStr] = { date: dateStr, total: 0 };
      
      // Initialize each status count to 0
      Object.values(Statuses).forEach(status => {
        dateMap[dateStr][status] = 0;
      });
    }
    
    // Count complaints per day
    filteredComplaints.forEach(complaint => {
      const date = new Date(complaint.timestamp.seconds * 1000);
      const dateStr = format(date, 'MMM dd');
      
      if (dateMap[dateStr]) {
        dateMap[dateStr].total++;
        dateMap[dateStr][complaint.status] = (dateMap[dateStr][complaint.status] || 0) + 1;
      }
    });
    
    return Object.values(dateMap);
  }, [filteredComplaints, timeRange]);

  // Handle data export to Excel
  const handleExport = async () => {
    try {
      if (filteredComplaints.length === 0) {
        toast.warning('No data to export');
        return;
      }
      
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Complaints Data');
      
      // Add headers
      const headers = ['ID', 'Issue Type', 'Status', 'Date', 'Description'];
      worksheet.addRow(headers);
      
      // Style headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' }
      };
      
      // Add data rows
      filteredComplaints.forEach(complaint => {
        worksheet.addRow([
          complaint.id,
          complaint.issueType,
          complaint.status,
          format(new Date(complaint.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm'),
          complaint.description || ''
        ]);
      });
      
      // Auto-fit columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          maxLength = Math.max(maxLength, columnLength);
        });
        column.width = Math.min(Math.max(maxLength + 2, 10), 40);
      });
      
      // Add a summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['Analytics Summary']).font = { bold: true, size: 16 };
      summarySheet.addRow(['Generated on', format(new Date(), 'yyyy-MM-dd HH:mm')]);
      summarySheet.addRow(['Total Complaints', filteredComplaints.length]);
      
      // Add issue type summary
      summarySheet.addRow([]);
      summarySheet.addRow(['Issue Type', 'Count']).font = { bold: true };
      issueTypeData.forEach(item => {
        summarySheet.addRow([item.name, item.value]);
      });
      
      // Add status summary
      summarySheet.addRow([]);
      summarySheet.addRow(['Status', 'Count']).font = { bold: true };
      statusData.forEach(item => {
        summarySheet.addRow([item.name, item.value]);
      });

      // Auto-fit summary columns
      summarySheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          maxLength = Math.max(maxLength, columnLength);
        });
        column.width = Math.min(Math.max(maxLength + 2, 10), 40);
      });

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const data = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(data, `complaints_analytics_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      
      toast.success('Export completed successfully!');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Failed to export data. Please try again.');
    }
  };

  const handleTimeRangeChange = (event) => {
    setTimeRange(event.target.value);
  };

  const handleViewAllTime = () => {
    setTimeRange('all');
  };

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (!filteredComplaints.length) return null;
    
    const total = filteredComplaints.length;
    const solved = filteredComplaints.filter(c => c.status === Statuses.solved).length;
    const inProgress = filteredComplaints.filter(c => c.status === Statuses.inProgress).length;
    const rejected = filteredComplaints.filter(c => c.status === Statuses.rejected).length;
    const resolutionRate = total > 0 ? Math.round((solved / total) * 100) : 0;
    
    return {
      total,
      solved,
      inProgress,
      rejected,
      resolutionRate
    };
  }, [filteredComplaints]);

  if (accessDenied) {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          You do not have permission to access the analytics dashboard.
        </Alert>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={() => navigate('/')}
        >
          Return to Home
        </Button>
      </Container>
    );
  }

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} thickness={4} style={{ marginBottom: 20 }} />
        <Typography variant="h6" color="textSecondary">Loading analytics data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3} textAlign="center">
        <Typography variant="h5" color="error" gutterBottom>
          Error Loading Data
        </Typography>
        <Typography color="textSecondary" paragraph>
          {error}
        </Typography>
        <Button 
          variant="outlined" 
          color="primary"
          onClick={() => window.location.reload()}
          startIcon={<RefreshIcon />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  if (filteredComplaints.length === 0) {
    return (
      <Box p={3} textAlign="center">
        <Typography variant="h5" gutterBottom>
          No Data Available
        </Typography>
        <Typography color="textSecondary" paragraph>
          There are no complaints to display for the selected time period.
        </Typography>
        <Button 
          variant="outlined" 
          color="primary"
          onClick={handleViewAllTime}
        >
          View All Time
        </Button>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>Analytics Dashboard</Typography>
          <Typography variant="subtitle1" color="textSecondary">
            {timeRange === 'all' ? 'All Time Data' : `Last ${timeRange} days`}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={2}>
          <FormControl variant="outlined" size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              onChange={handleTimeRangeChange}
              label="Time Range"
            >
              <MenuItem value="7">Last 7 days</MenuItem>
              <MenuItem value="30">Last 30 days</MenuItem>
              <MenuItem value="90">Last 90 days</MenuItem>
              <MenuItem value="365">Last year</MenuItem>
              <MenuItem value="all">All time</MenuItem>
            </Select>
          </FormControl>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleExport}
            startIcon={<RefreshIcon />}
          >
            Export Data
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      {summaryMetrics && (
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>Total Complaints</Typography>
              <Typography variant="h4">{summaryMetrics.total}</Typography>
              <Typography variant="caption" color="textSecondary">
                {timeRange === 'all' ? 'All time' : `Last ${timeRange} days`}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>Resolved</Typography>
              <Typography variant="h4" color="success.main">{summaryMetrics.solved}</Typography>
              <Typography variant="caption" color="textSecondary">
                {summaryMetrics.total > 0 
                  ? `${summaryMetrics.resolutionRate}% resolution rate` 
                  : 'No data'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>In Progress</Typography>
              <Typography variant="h4" color="warning.main">{summaryMetrics.inProgress}</Typography>
              <Typography variant="caption" color="textSecondary">
                {summaryMetrics.total > 0 
                  ? `${Math.round((summaryMetrics.inProgress / summaryMetrics.total) * 100)}% of total` 
                  : 'No data'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>Rejected</Typography>
              <Typography variant="h4" color="error.main">{summaryMetrics.rejected}</Typography>
              <Typography variant="caption" color="textSecondary">
                {summaryMetrics.total > 0 
                  ? `${Math.round((summaryMetrics.rejected / summaryMetrics.total) * 100)}% of total` 
                  : 'No data'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Issues by Type */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Issues by Type</Typography>
            {issueTypeData.length > 0 ? (
              <Box height={400}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={issueTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {issueTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} complaints`, 'Count']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box height={400} display="flex" alignItems="center" justifyContent="center">
                <Typography color="textSecondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Status Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Status Distribution</Typography>
            {statusData.length > 0 ? (
              <Box height={400}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} complaints`, 'Count']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box height={400} display="flex" alignItems="center" justifyContent="center">
                <Typography color="textSecondary">No data available</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Trend Analysis */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Complaint Trends Over Time</Typography>
            {timeSeriesData.length > 0 ? (
              <Box height={400}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={timeSeriesData}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total Complaints"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                    {Object.values(Statuses).map((status) => (
                      <Line
                        key={status}
                        type="monotone"
                        dataKey={status}
                        name={status}
                        stroke={statusColors[status.toLowerCase()] || '#999999'}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box height={400} display="flex" alignItems="center" justifyContent="center">
                <Typography color="textSecondary">No data available for the selected period</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AnalyticsDashboard;
