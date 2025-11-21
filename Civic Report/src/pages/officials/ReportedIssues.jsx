import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  CardMedia, 
  CardActions, 
  Button, 
  Chip, 
  Grid, 
  Container, 
  Avatar, 
  Divider, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  IconButton,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import { 
  Report, 
  Delete, 
  Close, 
  Warning, 
  CheckCircle, 
  ArrowBack 
} from '@mui/icons-material';
import { db } from '../../utils/Firebase';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const ReportedIssues = () => {
  const [reportedPosts, setReportedPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [deleting, setDeleting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchReportedPosts = async () => {
      try {
        const complaintsRef = collection(db, 'complaints');
        const q = query(
          complaintsRef, 
          where('reportCount', '>', 0),
          orderBy('reportCount', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const posts = [];
        
        // Collect unique user IDs for reporters and authors
        const reporterIds = [];
        const authorIds = [];
        const postsData = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          postsData.push({ id: doc.id, ...data });
          
          // Handle both string and array types for reportedBy and collect reporter IDs
          if (data.reportedBy) {
            const reporters = Array.isArray(data.reportedBy)
              ? data.reportedBy
              : [data.reportedBy];

            reporters.forEach(reporterId => {
              if (reporterId && !reporterIds.includes(reporterId)) {
                reporterIds.push(reporterId);
              }
            });
          }

          // Collect author IDs (the original poster of the complaint)
          if (data.reportedBy) {
            if (typeof data.reportedBy === 'string') {
              if (!authorIds.includes(data.reportedBy)) authorIds.push(data.reportedBy);
            } else if (Array.isArray(data.reportedBy) && data.reportedBy.length > 0) {
              const firstAuthor = data.reportedBy[0];
              if (firstAuthor && !authorIds.includes(firstAuthor)) authorIds.push(firstAuthor);
            }
          }
        });
        
        // Fetch reporter details by user document ID
        const reportersMap = new Map();
        if (reporterIds.length > 0) {
          await Promise.all(
            reporterIds.map(async (uid) => {
              try {
                const uDoc = await getDoc(doc(db, 'users', uid));
                if (uDoc.exists()) {
                  const uData = uDoc.data();
                  reportersMap.set(uid, {
                    name: uData.name || 'Unknown User',
                    avatar: uData.profilePhoto || uData.avatarUrl || ''
                  });
                } else {
                  reportersMap.set(uid, { name: 'Unknown User', avatar: '' });
                }
              } catch (e) {
                reportersMap.set(uid, { name: 'Unknown User', avatar: '' });
              }
            })
          );
        }

        // Fetch author details (original poster) by user document ID
        const authorsMap = new Map();
        if (authorIds.length > 0) {
          await Promise.all(
            authorIds.map(async (uid) => {
              try {
                const aDoc = await getDoc(doc(db, 'users', uid));
                if (aDoc.exists()) {
                  const aData = aDoc.data();
                  authorsMap.set(uid, {
                    name: aData.name || 'Unknown User',
                    avatar: aData.profilePhoto || aData.avatarUrl || ''
                  });
                } else {
                  authorsMap.set(uid, { name: 'Unknown User', avatar: '' });
                }
              } catch (e) {
                authorsMap.set(uid, { name: 'Unknown User', avatar: '' });
              }
            })
          );
        }
        
        // Enrich posts with reporter info
        const enrichedPosts = postsData.map(post => {
          const reporters = [];
          if (post.reportedBy) {
            const postReporters = Array.isArray(post.reportedBy)
              ? post.reportedBy
              : [post.reportedBy];

            postReporters.forEach(reporterId => {
              if (reporterId) {
                const reporter = reportersMap.get(reporterId) || {
                  name: 'Unknown User',
                  avatar: ''
                };
                if (!reporters.some(r => r.id === reporterId)) {
                  reporters.push({
                    id: reporterId,
                    ...reporter
                  });
                }
              }
            });
          }

          // Attach author (posted by) details
          const authorId = typeof post.reportedBy === 'string' ? post.reportedBy : (Array.isArray(post.reportedBy) ? post.reportedBy[0] : null);
          const author = authorId ? (authorsMap.get(authorId) || { name: 'Unknown User', avatar: '' }) : { name: 'Unknown User', avatar: '' };
          
          return {
            ...post,
            reporters,
            userName: author.name,
            userAvatar: author.avatar,
            // Prefer explicit timestamp field, fallback to createdAt
            formattedDate: (post.timestamp || post.createdAt)
              ? formatDateSafe(post.timestamp || post.createdAt)
              : 'Unknown date'
          };
        });
        
        setReportedPosts(enrichedPosts);
      } catch (error) {
        console.error('Error fetching reported posts:', error);
        setSnackbar({
          open: true,
          message: 'Failed to load reported posts',
          severity: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchReportedPosts();
  }, []);

  const handleViewDetails = (post) => {
    setSelectedPost(post);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedPost(null);
  };

  const handleDismissReport = async () => {
    if (!selectedPost) return;
    
    try {
      setDismissing(true);
      const postRef = doc(db, 'complaints', selectedPost.id);
      await updateDoc(postRef, { 
        reportCount: 0,
        reportedBy: []
      });
      
      // Update local state
      setReportedPosts(prevPosts => 
        prevPosts.filter(post => post.id !== selectedPost.id)
      );
      
      setSnackbar({
        open: true,
        message: 'Report dismissed successfully',
        severity: 'success'
      });
      
      handleCloseDialog();
    } catch (error) {
      console.error('Error dismissing report:', error);
      setSnackbar({
        open: true,
        message: 'Failed to dismiss report',
        severity: 'error'
      });
    } finally {
      setDismissing(false);
    }
  };

  const handleDeletePost = async () => {
    if (!selectedPost) return;
    
    try {
      setDeleting(true);
      const postRef = doc(db, 'complaints', selectedPost.id);
      await deleteDoc(postRef);
      
      // Update local state
      setReportedPosts(prevPosts => 
        prevPosts.filter(post => post.id !== selectedPost.id)
      );
      
      setSnackbar({
        open: true,
        message: 'Post deleted successfully',
        severity: 'success'
      });
      
      handleCloseDialog();
    } catch (error) {
      console.error('Error deleting post:', error);
      setSnackbar({
        open: true,
        message: 'Failed to delete post',
        severity: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // Robust date formatter supporting Firestore Timestamp or ISO string
  const formatDateSafe = (dateValue) => {
    if (!dateValue) return 'Unknown date';
    try {
      if (dateValue?.toDate) {
        return format(dateValue.toDate(), 'MMM d, yyyy h:mm a');
      }
      if (typeof dateValue === 'string') {
        return format(parseISO(dateValue), 'MMM d, yyyy h:mm a');
      }
      return 'Unknown date';
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Unknown date';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" alignItems="center" mb={4}>
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Suspicious Reports
        </Typography>
        <Chip 
          label={`${reportedPosts.length} ${reportedPosts.length === 1 ? 'Report' : 'Reports'}`}
          color="error" 
          icon={<Report />} 
          sx={{ ml: 2, px: 1 }}
        />
      </Box>
      
      {reportedPosts.length === 0 ? (
        <Box 
          display="flex" 
          flexDirection="column" 
          alignItems="center" 
          justifyContent="center" 
          minHeight="50vh"
          textAlign="center"
        >
          <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            No reported issues found
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mt: 1 }}>
            All posts are currently clean and free from reports.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {reportedPosts.map((post) => (
            <Grid item xs={12} sm={6} md={4} key={post.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 3
                  }
                }}
              >
                {post.imageUrl && (
                  <CardMedia
                    component="img"
                    height="180"
                    image={post.imageUrl}
                    alt="Reported post"
                    sx={{ objectFit: 'cover' }}
                  />
                )}
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" mb={1}>
                    <Avatar 
                      src={post.userPhotoURL} 
                      alt={post.userName}
                      sx={{ width: 32, height: 32, mr: 1 }}
                    />
                    <Typography variant="subtitle2" noWrap>
                      {post.userName || 'Anonymous'}
                    </Typography>
                  </Box>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      mb: 1
                    }}
                  >
                    {post.description}
                  </Typography>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                    <Chip 
                      label={`${post.reportCount} ${post.reportCount === 1 ? 'Report' : 'Reports'}`}
                      color="error"
                      size="small"
                      icon={<Warning fontSize="small" />}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {post.formattedDate || formatDateSafe(post.createdAt)}
                    </Typography>
                  </Box>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button 
                    size="small" 
                    color="primary"
                    onClick={() => handleViewDetails(post)}
                    fullWidth
                  >
                    Review
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Post Details Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box display="flex" alignItems="center">
            <Warning color="error" sx={{ mr: 1 }} />
            <span>Reported Post Details</span>
          </Box>
          <IconButton onClick={handleCloseDialog} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers>
          {selectedPost && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={selectedPost.imageUrl ? 6 : 12}>
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Posted by
                  </Typography>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Avatar 
                      src={selectedPost.userPhotoURL} 
                      alt={selectedPost.userName}
                      sx={{ width: 40, height: 40, mr: 1.5 }}
                    />
                    <Box>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {selectedPost.userName || 'Anonymous'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateSafe(selectedPost.timestamp || selectedPost.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
                
                <Box mb={3}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body1" paragraph>
                    {selectedPost.description}
                  </Typography>
                </Box>
                
                <Box mb={3}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Typography variant="body2" color="error" fontWeight="medium">
                      {selectedPost.reportCount} {selectedPost.reportCount === 1 ? 'Report' : 'Reports'}
                    </Typography>
                    {selectedPost.reporters && selectedPost.reporters.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        • Reported by: {selectedPost.reporters[0].name}
                        {selectedPost.reporters.length > 1 && ` +${selectedPost.reporters.length - 1} others`}
                      </Typography>
                    )}
                  </Box>
                  <Box 
                    p={2} 
                    bgcolor="error.light" 
                    borderRadius={1}
                    display="flex"
                    alignItems="center"
                  >
                    <Warning color="error" sx={{ mr: 1 }} />
                    <Typography variant="body2">
                      This post has been reported <strong>{selectedPost.reportCount} {selectedPost.reportCount === 1 ? 'time' : 'times'}</strong> by community members.
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              
              {selectedPost.imageUrl && (
                <Grid item xs={12} md={6}>
                  <Box 
                    sx={{
                      height: '100%',
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'background.paper',
                      p: 1
                    }}
                  >
                    <img 
                      src={selectedPost.imageUrl} 
                      alt="Reported content"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '400px',
                        objectFit: 'contain',
                        borderRadius: '4px'
                      }}
                    />
                  </Box>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button 
            onClick={handleDismissReport}
            disabled={dismissing}
            startIcon={<CheckCircle />}
            color="success"
          >
            {dismissing ? 'Dismissing...' : 'Dismiss Report'}
          </Button>
          
          <Box>
            <Button 
              onClick={handleCloseDialog}
              sx={{ mr: 1 }}
            >
              Close
            </Button>
            <Button 
              onClick={handleDeletePost}
              disabled={deleting}
              startIcon={<Delete />}
              color="error"
              variant="contained"
            >
              {deleting ? 'Deleting...' : 'Delete Post'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleSnackbarClose} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ReportedIssues;
