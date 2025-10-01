import { fetchComplaints } from './FirebaseFunctions';
import { Statuses } from './enums';

/**
 * Fetches and processes analytics data for the chatbot
 * @returns {Promise<Object>} Processed analytics data
 */
export const getAnalyticsData = async () => {
  try {
    const complaints = await fetchComplaints();
    
    // Process status distribution
    const statusCount = complaints.reduce((acc, complaint) => {
      acc[complaint.status] = (acc[complaint.status] || 0) + 1;
      return acc;
    }, {});
    
    const statusData = Object.entries(Statuses).map(([key, name]) => ({
      name,
      value: statusCount[key] || 0,
      key
    }));

    // Process issue types
    const issueTypeCount = complaints.reduce((acc, complaint) => {
      const type = complaint.issueType || 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    const issueTypeData = Object.entries(issueTypeCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / complaints.length) * 100) || 0
      }));

    // Calculate resolution rate
    const resolvedCount = statusCount['solved'] || 0;
    const totalProcessed = complaints.length - (statusCount['pending'] || 0);
    const resolutionRate = totalProcessed > 0 
      ? Math.round((resolvedCount / totalProcessed) * 100) 
      : 0;

    // Helper: normalize any timestamp shape to a Date
    const toDate = (ts) => {
      try {
        if (!ts) return null;
        if (ts instanceof Date) return ts;
        if (ts?.toDate) return ts.toDate(); // Firestore Timestamp
        if (typeof ts === 'number') return new Date(ts);
        if (typeof ts === 'string') return new Date(ts);
      } catch {}
      return null;
    };

    // Get recent complaints
    const recentComplaints = [...complaints]
      .map(c => ({ ...c, _ts: toDate(c.timestamp) }))
      .filter(c => c._ts && !isNaN(c._ts.getTime()))
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        title: c.title || 'Untitled Complaint',
        status: Statuses[c.status] || c.status,
        issueType: c.issueType || 'Other',
        timestamp: c._ts.toLocaleDateString()
      }));

    return {
      totalComplaints: complaints.length,
      statusDistribution: statusData,
      topIssues: issueTypeData.slice(0, 5),
      resolutionRate,
      recentComplaints,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    throw new Error('Failed to load analytics data');
  }
};

/**
 * Formats analytics data into a human-readable string
 * @param {Object} analyticsData - The analytics data to format
 * @returns {string} Formatted analytics summary
 */
export const formatAnalyticsSummary = (analyticsData) => {
  if (!analyticsData) return 'No analytics data available';

  const {
    totalComplaints,
    statusDistribution,
    topIssues,
    resolutionRate,
    recentComplaints
  } = analyticsData;

  let summary = `📊 *Civic Issue Analytics*\n\n`;
  summary += `• Total complaints: *${totalComplaints}*\n`;
  
  // Add status distribution
  summary += `\n*Status Distribution:*\n`;
  statusDistribution.forEach(status => {
    if (status.value > 0) {
      const percentage = Math.round((status.value / totalComplaints) * 100);
      summary += `- ${status.name}: ${status.value} (${percentage}%)\n`;
    }
  });
  
  // Add top issues
  summary += `\n*Top Issue Types:*\n`;
  topIssues.forEach(issue => {
    summary += `- ${issue.name}: ${issue.count} (${issue.percentage}%)\n`;
  });
  
  // Add resolution rate
  summary += `\n*Resolution Rate:* ${resolutionRate}%\n`;
  
  // Add recent complaints
  if (recentComplaints.length > 0) {
    summary += `\n*Recent Complaints:*\n`;
    recentComplaints.forEach(comp => {
      summary += `- [${comp.status}] ${comp.title} (${comp.issueType}) - ${comp.timestamp}\n`;
    });
  }
  
  return summary;
};
