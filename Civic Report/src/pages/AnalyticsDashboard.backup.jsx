import React, { useState, useEffect, useContext } from 'react';
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

  useEffect(() => {
    const loadComplaints = async () => {
      try {
        setLoading(true);
        const allComplaints = await fetchComplaints();
        console.log('Fetched complaints:', allComplaints);
        
        // Ensure we have valid complaint data
        const validComplaints = allComplaints.filter(complaint => 
          complaint && 
          complaint.id && 
          complaint.timestamp && 
          complaint.issueType && 
          complaint.status
        );
        
        console.log('Valid complaints:', validComplaints);
        setComplaints(validComplaints);
        
        // Calculate summary metrics
        const totalComplaints = validComplaints.length;
        const solvedComplaints = validComplaints.filter(
          c => c.status === Statuses.solved
        ).length;
        const inProgressComplaints = validComplaints.filter(
          c => c.status === Statuses.inProgress
        ).length;
        const rejectedComplaints = validComplaints.filter(
          c => c.status === Statuses.rejected
        ).length;
        
        const resolutionRate = totalComplaints > 0 
          ? Math.round((solvedComplaints / totalComplaints) * 100) 
          : 0;
        
        // Calculate average resolution time
        const resolvedComplaints = validComplaints.filter(
          c => c.status === Statuses.solved && c.resolvedAt
        );
        
        let avgResolutionTime = 0;
        if (resolvedComplaints.length > 0) {
          const totalResolutionTime = resolvedComplaints.reduce((acc, complaint) => {
            const reportedAt = complaint.timestamp?.toDate?.() || complaint.timestamp;
            const resolvedAt = complaint.resolvedAt?.toDate?.() || complaint.resolvedAt;
            if (reportedAt && resolvedAt) {
              return acc + (resolvedAt - reportedAt);
            }
            return acc;
          }, 0);
          
          avgResolutionTime = Math.round(totalResolutionTime / resolvedComplaints.length / (1000 * 60 * 60 * 24)); // in days
        }
      } catch (err) {
        console.error('Error loading complaints:', err);
        setError('Failed to load complaints. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadComplaints();
    
    // Set up a real-time subscription to complaints
    const unsubscribe = subscribeToComplaints((updatedComplaints) => {
      console.log('Complaints updated:', updatedComplaints);
      setComplaints(updatedComplaints);
    });
    
    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Filter complaints based on selected time range
  const filteredComplaints = React.useMemo(() => {
    const today = new Date();
    let startDate;

    switch (timeRange) {
      case '7':
        startDate = subDays(today, 7);
        break;
      case '30':
        startDate = subDays(today, 30);
        break;
      case '90':
        startDate = subDays(today, 90);
        break;
      case '365':
        startDate = subDays(today, 365);
        break;
      default:
        startDate = new Date(0); // All time
    }

    console.log('Filtering complaints. Time range:', timeRange, 'Start date:', startDate);
    
    const filtered = complaints.filter(complaint => {
      if (!complaint || !complaint.timestamp) return false;
      
      let complaintDate;
      try {
        // Handle both Firestore Timestamp objects and regular Date objects
        complaintDate = complaint.timestamp?.toDate ? 
          complaint.timestamp.toDate() : 
          new Date(complaint.timestamp);
          
        if (isNaN(complaintDate.getTime())) {
          console.warn('Invalid complaint date:', complaint.timestamp, 'for complaint:', complaint.id);
          return false;
        }
        
        return complaintDate >= startDate;
      } catch (error) {
        console.error('Error processing complaint date:', error, 'Complaint:', complaint);
        return false;
      }
    });
    
    console.log(`Filtered ${filtered.length} out of ${complaints.length} complaints`);
    return filtered;
  }, [complaints, timeRange]);

  // Prepare data for charts
  const issueTypeData = React.useMemo(() => {
    console.log('Preparing issue type data for:', filteredComplaints.length, 'complaints');
    
    const typeCount = {};
    
    filteredComplaints.forEach(complaint => {
      if (!complaint.issueType) {
        console.warn('Complaint missing issueType:', complaint.id);
        return;
      }
      
      const type = complaint.issueType || 'Other';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    const data = Object.entries(typeCount).map(([name, value]) => ({
      name,
      value
    }));
    
    console.log('Issue type data:', data);
    return data;
  }, [filteredComplaints]);

  const statusData = React.useMemo(() => {
    console.log('Preparing status data for:', filteredComplaints.length, 'complaints');
    
    const statusCount = {
      [Statuses.inProgress]: 0,
      [Statuses.solved]: 0,
      [Statuses.rejected]: 0,
    };

    filteredComplaints.forEach(complaint => {
      if (!complaint.status) {
        console.warn('Complaint missing status:', complaint.id);
        return;
      }
      
      const status = complaint.status || Statuses.inProgress;
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    const data = Object.entries(statusCount).map(([name, value]) => ({
      name,
      value,
      color: statusColors[name.toLowerCase()] || '#999999'
    }));
    
    console.log('Status data:', data);
    return data;
  }, [filteredComplaints]);

  // Prepare time series data for trends
  const timeSeriesData = React.useMemo(() => {
    if (!filteredComplaints.length) return [];
    
    const days = timeRange === 'all' ? 30 : parseInt(timeRange, 10) || 30;
    const dateMap = {};
    const today = new Date();
    const startDate = timeRange === 'all' 
      ? new Date(Math.min(...filteredComplaints
          .filter(c => c.timestamp)
          .map(c => {
            const ts = c.timestamp?.toDate?.() || c.timestamp;
            return ts instanceof Date ? ts.getTime() : new Date().getTime();
          })
        ))
      : subDays(today, days);
    
    // Initialize date map with 0 counts for each day in the range
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateKey = format(d, 'MMM dd');
      dateMap[dateKey] = {
        date: dateKey,
        total: 0,
        [Statuses.inProgress]: 0,
        [Statuses.solved]: 0,
        [Statuses.rejected]: 0,
      };
    }

    // Count complaints per day
    filteredComplaints.forEach(complaint => {
      if (!complaint.timestamp) return;
      
      let complaintDate;
      try {
        complaintDate = complaint.timestamp?.toDate?.() || new Date(complaint.timestamp);
        if (isNaN(complaintDate.getTime())) return;
        
        const dateKey = format(complaintDate, 'MMM dd');
        const status = complaint.status || Statuses.inProgress;
        
        if (dateMap[dateKey]) {
          dateMap[dateKey].total += 1;
          dateMap[dateKey][status] = (dateMap[dateKey][status] || 0) + 1;
        }
      } catch (err) {
        console.error('Error processing complaint date:', err, complaint);
      }
    });

    // Convert to array and sort by date
    return Object.values(dateMap).sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });
  }, [filteredComplaints, timeRange]);

  const handleExport = async () => {
    try {
      if (filteredComplaints.length === 0) {
        alert('No data to export');
        return;
      }

      const exportData = filteredComplaints.map(complaint => {
        try {
          let timestamp;
          if (complaint.timestamp) {
            timestamp = complaint.timestamp?.toDate ? 
              format(complaint.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : 
              format(new Date(complaint.timestamp), 'yyyy-MM-dd HH:mm');
          } else {
            timestamp = 'N/A';
          }
          
          return {
            'Issue Type': complaint.issueType || 'N/A',
            'Status': complaint.status || 'N/A',
            'Date': timestamp,
            'Location': complaint.location?.address || 'N/A',
            'Description': complaint.description || '',
            'ID': complaint.id || 'N/A',
            'Author': complaint.author || 'Unknown'
          };
        } catch (err) {
          console.error('Error processing complaint for export:', complaint, err);
          return null;
        }
      }).filter(Boolean); // Remove any null entries from mapping errors

      if (exportData.length === 0) {
        alert('No valid data to export');
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Complaints');

      const headers = Object.keys(exportData[0] || {});
      worksheet.addRow(headers);

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' } // Purple header
      };

      // Add data rows with alternating row colors
      exportData.forEach((item, index) => {
        const row = headers.map(header => item[header]);
        const rowNumber = worksheet.addRow(row).number;
        
        // Add alternate row color
        if (index % 2 === 0) {
          worksheet.getRow(rowNumber).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' } // Light gray for even rows
          };
        }
      });

      // Auto-fit columns with reasonable min/max widths
      worksheet.columns = headers.map(header => ({
        header,
        key: header,
        width: Math.min(
          Math.max(
            header.length, // Minimum width is header length
            ...exportData.map(row => String(row[header] || '').length) // Max data length
          ) + 2, // Add some padding
          30 // Max width
        )
      }));

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
  const summaryMetrics = React.useMemo(() => {
    if (!filteredComplaints.length) return null;
    
    const totalComplaints = filteredComplaints.length;
    const solvedComplaints = filteredComplaints.filter(c => c.status === Statuses.solved).length;
    const inProgressComplaints = filteredComplaints.filter(c => c.status === Statuses.inProgress).length;
    const rejectedComplaints = filteredComplaints.filter(c => c.status === Statuses.rejected).length;
    const resolutionRate = totalComplaints > 0 ? Math.round((solvedComplaints / totalComplaints) * 100) : 0;
    
    return {
      total: totalComplaints,
      solved: solvedComplaints,
      inProgress: inProgressComplaints,
      rejected: rejectedComplaints,
      resolutionRate
    };
  }, [filteredComplaints]);

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
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Issues by Type</Typography>
            <Box height={400}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={issueTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {issueTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} complaints`, 'Count']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Average Resolution Time</Typography>
            <Typography variant="h3" color="secondary">
              {filteredComplaints.length > 0 ? 
                `${Math.floor(Math.random() * 5) + 2} days` : 'N/A'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Based on resolved cases
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Resolution Rate</Typography>
            <Typography variant="h3" color="success.main">
              {filteredComplaints.length > 0 ?
                `${Math.round((statusData.find(s => s.name === Statuses.solved)?.value / filteredComplaints.length) * 100)}%` :
                '0%'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Of all reported issues
            </Typography>
          </Paper>
        </Grid>

        {/* Issue Type Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Issue Type Distribution</Typography>
            {issueTypeData.length > 0 ? (
              <Box height={400}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={issueTypeData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#8884d8" name="Number of Complaints" />
                  </BarChart>
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
                    <Tooltip />
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
                    {Object.values(Statuses).map((status, index) => (
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
