import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth, db, storage } from "./Firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  setDoc,
  doc,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  deleteDoc,
  increment,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { Statuses, userTypes } from "./enums";

// Helper function to check if Aadhar is already registered
const checkAadharExists = async (aadhar) => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('aadhar', '==', aadhar));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking Aadhar:', error);
    throw error;
  }
};

const handleRegistration = async (formData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      formData.email,
      formData.password
    );
    const user = userCredential.user;
    await updateProfile(user, { displayName: formData.name });
    await setDoc(doc(db, "users", user.uid), {
      name: formData.name,
      email: formData.email,
      mobile: formData.mobile,
      type: userTypes.citizen,
      following: [],
      followers: [],
    });
    return user;
  } catch (error) {
    throw new Error(error.message);
  }
};

const isOfficial = async (userId) => {
  try {
    console.log('[isOfficial] Checking if user is official:', { userId });
    
    if (!userId) {
      console.log('[isOfficial] No user ID provided');
      return false;
    }
    
    const userDocRef = doc(db, "users", userId);
    console.log('[isOfficial] Fetching user document...');
    
    const userDocSnapshot = await getDoc(userDocRef);
    
    if (!userDocSnapshot.exists()) {
      console.log('[isOfficial] User document does not exist');
      return false;
    }
    
    const userData = userDocSnapshot.data() || {};
    console.log('[isOfficial] User data:', userData);
    
    // Support both schemas: { type: userTypes.official } and { userType: 'official' }
    const isOfficialUser = userData.type === userTypes.official || userData.userType === 'official';
    console.log('[isOfficial] User is official:', isOfficialUser);
    
    return isOfficialUser;
    
  } catch (error) {
    console.error('[isOfficial] Error checking if user is official:', error);
    return false;
  }
};

const handleLogin = async (formData) => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(
      auth,
      formData.email,
      formData.password
    );
    const user = userCredential.user;
    const isOfficialUser = await isOfficial(user.uid);
    return { ...user, official: isOfficialUser };
  } catch (error) {
    throw new Error(error.message);
  }
};

// Upload file to Firebase Storage
const uploadToFirebaseStorage = async (file, path = 'audio/') => {
  try {
    const storage = getStorage();
    const storageRef = ref(storage, `${path}${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
          // Progress function
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        }, 
        (error) => {
          // Handle unsuccessful uploads
          console.error('Error uploading file:', error);
          reject(error);
        }, 
        async () => {
          // Handle successful uploads on complete
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              url: downloadURL,
              path: uploadTask.snapshot.ref.fullPath,
              name: file.name,
              type: file.type,
              size: file.size
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error in uploadToFirebaseStorage:', error);
    throw error;
  }
};

const uploadToCloudinary = async (file, folder, resourceType = 'auto') => {
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dr3puskd8';
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'mobilease_unsigned';
  const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY || '383239151459235';

  if (!CLOUD_NAME || !UPLOAD_PRESET || !API_KEY) {
    throw new Error("Cloudinary configuration is missing. Please check your environment variables.");
  }

  const uploadData = new FormData();
  uploadData.append('file', file);
  uploadData.append('upload_preset', UPLOAD_PRESET);
  uploadData.append('folder', folder);
  uploadData.append('public_id', `${folder}_${Date.now()}`);
  uploadData.append('api_key', API_KEY);
  uploadData.append('resource_type', resourceType);

  console.log(`Uploading ${file.type} to Cloudinary:`, {
    cloudName: CLOUD_NAME,
    uploadPreset: UPLOAD_PRESET,
    file: file.name,
    size: file.size,
    type: file.type,
    resourceType
  });

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: uploadData }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Cloudinary upload error:', errorData);
      let errorMessage = `Failed to upload ${file.type.startsWith('audio/') ? 'audio' : 'file'}`;
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Cloudinary upload successful:', { 
      url: data.secure_url,
      type: data.resource_type,
      format: data.format
    });
    return data.secure_url;
  } catch (error) {
    console.error(`Error during ${file.type} upload:`, error);
    throw new Error(`Failed to upload ${file.type.startsWith('audio/') ? 'audio' : 'file'}: ${error.message}`);
  }
};

const createComplaint = async (formData, audioBlob = null) => {
  let audioUrl = '';
  let mediaUrl = '';
  let photoUrls = [];
  let videoUrl = '';
  
  try {
    // Upload audio file if provided
    if (audioBlob) {
      try {
        const audioFile = new File([audioBlob], `audio_${Date.now()}.wav`, { type: 'audio/wav' });
        const audioUpload = await uploadToFirebaseStorage(audioFile, 'complaints/audio/');
        audioUrl = audioUpload.url;
      } catch (error) {
        console.error('Error uploading audio:', error);
        // Don't fail the whole complaint if audio upload fails
      }
    }
    
    // Upload legacy single media if exists
    if (formData.media) {
      try {
        mediaUrl = await uploadToCloudinary(
          formData.media,
          'complaints/media',
          formData.mediaType === 'video' ? 'video' : 'image'
        );
      } catch (error) {
        console.error('Error uploading legacy media:', error);
        // Continue with complaint creation even if media upload fails
      }
    }

    // Upload multiple photos if provided
    if (Array.isArray(formData.photos) && formData.photos.length > 0) {
      for (const photoFile of formData.photos) {
        try {
          const url = await uploadToCloudinary(photoFile, 'complaints/photos', 'image');
          if (url) photoUrls.push(url);
        } catch (err) {
          console.error('Error uploading a photo:', err);
          // continue with others
        }
      }
    }

    // Upload single video if provided
    if (formData.video) {
      try {
        videoUrl = await uploadToCloudinary(formData.video, 'complaints/videos', 'video');
      } catch (err) {
        console.error('Error uploading video:', err);
      }
    }

    // Upload audio file if exists
    if (formData.audio) {
      try {
        // Convert Blob to File with proper type
        const audioFile = new File(
          [formData.audio], 
          `audio_${Date.now()}.wav`, 
          { type: 'audio/wav' }
        );
        audioUrl = await uploadToCloudinary(audioFile, 'complaints/audio', 'video');
      } catch (error) {
        console.error('Error uploading audio:', error);
        // Continue with complaint creation even if audio upload fails
      }
    }

    const complaintData = {
      reason: formData.reason,
      description: formData.description,
      // Backward-compatible top-level single media field; prefer video, else first photo, else legacy media
      mediaPath: videoUrl || (photoUrls[0] || '') || mediaUrl,
      audioPath: audioUrl,
      location: formData.location,
      status: Statuses.pending, // All new complaints start as PENDING
      timestamp: new Date().toISOString(),
      reportedBy: formData.reportedBy,
      likesCount: 0,
      audioUrl: audioUrl || '',
      lastUpdated: new Date().toISOString(),
      statusHistory: [{
        status: Statuses.pending,
        timestamp: new Date().toISOString(),
        updatedBy: formData.reportedBy
      }],
      // New structured media fields
      mediaPaths: photoUrls, // array of images
      videoPath: videoUrl // single video
    };
    
    const docRef = await addDoc(collection(db, "complaints"), complaintData);
    console.log('Complaint created with ID:', docRef.id);
    return { id: docRef.id, ...complaintData };
  } catch (error) {
    console.error('Error creating complaint:', error);
    throw new Error(error.message || 'Failed to create complaint');
  }
};

const fetchComplaintsByUser = (uid, handleComplaintsUpdate, userRole = 'citizen') => {
  console.log('fetchComplaintsByUser called with:', { uid, userRole });
  
  if (!uid) {
    console.warn('No UID provided to fetchComplaintsByUser');
    handleComplaintsUpdate([]);
    return () => {}; // Return empty cleanup function
  }
  
  try {
    const complaintsRef = collection(db, "complaints");
    
    // For citizens, only show resolved complaints
    // For officials, show all complaints with status IN_PROGRESS or CANCELLED
    let q;
    
    if (userRole === userTypes.official) {
      console.log('Setting up query for official user');
      q = query(
        complaintsRef,
        where("reportedBy", "==", uid),
        // Show items that are in progress or rejected for officials
        where("status", "in", [Statuses.inProgress, Statuses.rejected])
      );
    } else {
      console.log('Setting up query for citizen user');
      // Show all posts by this user on their profile (no status filter)
      q = query(
        complaintsRef,
        where("reportedBy", "==", uid)
      );
    }

    console.log('Setting up snapshot listener with query:', q);
    return onSnapshot(q, 
      async (querySnapshot) => {
        console.log('Query snapshot received');
        
        try {
          const complaints = [];
          
          // Process each complaint one by one instead of Promise.all to avoid race conditions
          for (const complaintDoc of querySnapshot.docs) {
            try {
              console.log('Processing complaint:', complaintDoc.id);
              const complaintData = complaintDoc.data();
              const complaintId = complaintDoc.id;

              // Get comments for the complaint
              const commentsRef = collection(db, "complaints", complaintId, "comments");
              const commentsQuerySnapshot = await getDocs(commentsRef);
              const comments = commentsQuerySnapshot.docs.map((commentDoc) => ({
                id: commentDoc.id,
                ...commentDoc.data(),
              }));

              // Get user details for the complaint reporter
              let userData = {};
              if (complaintData.reportedBy) {
                const userDoc = await getDoc(doc(db, "users", complaintData.reportedBy));
                if (userDoc.exists()) {
                  userData = userDoc.data();
                }
              }

              complaints.push({
                id: complaintId,
                ...complaintData,
                comments,
                author: userData?.name || 'Unknown User',
                timestamp: complaintData.timestamp?.toDate ? complaintData.timestamp.toDate() : new Date(complaintData.timestamp || Date.now())
              });
            } catch (error) {
              console.error('Error processing complaint:', error);
              // Continue with next complaint even if one fails
              continue;
            }
          }

          // Sort complaints by timestamp (newest first)
          const sortedComplaints = complaints.sort((a, b) => 
            new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
          );
          
          console.log('Successfully processed', sortedComplaints.length, 'complaints');
          handleComplaintsUpdate(sortedComplaints);
          
        } catch (error) {
          console.error('Error in complaint processing:', error);
          handleComplaintsUpdate([]);
        }
      },
      (error) => {
        console.error('Error in onSnapshot:', error);
        handleComplaintsUpdate([]);
      }
    );
  } catch (error) {
    console.error('Error setting up complaints query:', error);
    handleComplaintsUpdate([]);
    return () => {}; // Return empty cleanup function
  }
};

const findComplaintAuthor = async (uid) => {
  try {
    if (!uid) return null;
    const userDocRef = doc(db, "users", uid);
    const userDocSnapshot = await getDoc(userDocRef);
    return userDocSnapshot.exists() ? userDocSnapshot.data() : null;
  } catch (error) {
    console.error("Error fetching user:", error);
    throw error;
  }
};

const fetchComplaints = (handleComplaintsUpdate, userRole = 'citizen') => {
  console.log('[fetchComplaints] Starting with role:', userRole);
  const complaintsCollection = collection(db, "complaints");
  const updatedComplaints = [];

  // Create a query based on user role
  let complaintsQuery;
  if (userRole === 'official') {
    // For officials, show all complaints except those reported by the official themselves
    complaintsQuery = query(
      complaintsCollection,
      where("status", "in", ["pending", "inProgress", "solved", "rejected"])
    );
  } else {
    // For citizens, only show their own complaints
    const currentUser = auth.currentUser;
    if (!currentUser) return () => {};
    complaintsQuery = query(
      complaintsCollection,
      where("reportedBy", "==", currentUser.uid)
    );
  }

  console.log('[fetchComplaints] Setting up snapshot listener with query:', complaintsQuery);
  const unsubscribe = onSnapshot(complaintsQuery, async (complaintsSnapshot) => {
    console.log(`[fetchComplaints] Received snapshot with ${complaintsSnapshot.size} complaints`);
    updatedComplaints.length = 0; // Clear the array while keeping the reference

    // Process all complaints
    const processComplaints = async () => {
      for (const complaintDoc of complaintsSnapshot.docs) {
        try {
          const complaintData = complaintDoc.data();
          const complaintId = complaintDoc.id;
          const reportedByUserId = complaintData.reportedBy;

          // Get user data
          const userDoc = await getDoc(doc(db, "users", reportedByUserId));
          const userData = userDoc.exists() ? userDoc.data() : null;

          const complaintWithAuthor = {
            id: complaintId,
            author: userData?.name || "Unknown user",
            ...complaintData,
            comments: [],
          };

          // Set up comments subscription
          const commentsCollection = collection(db, "complaints", complaintId, "comments");
          const commentsUnsubscribe = onSnapshot(commentsCollection, (commentsSnapshot) => {
            const comments = commentsSnapshot.docs.map(commentDoc => ({
              id: commentDoc.id,
              ...commentDoc.data()
            }));
            
            // Update the complaint with new comments
            const complaintIndex = updatedComplaints.findIndex(c => c.id === complaintId);
            if (complaintIndex !== -1) {
              updatedComplaints[complaintIndex].comments = comments;
              if (typeof handleComplaintsUpdate === 'function') {
                console.log(`[fetchComplaints] Sending ${updatedComplaints.length} complaints to handler`);
        handleComplaintsUpdate([...updatedComplaints]);
              }
            }
          });

          // Store the unsubscribe function
          complaintWithAuthor.commentsUnsubscribe = commentsUnsubscribe;
          updatedComplaints.push(complaintWithAuthor);
        } catch (error) {
          console.error('Error processing complaint:', error);
        }
      }

      // Initial update after processing all complaints
      if (typeof handleComplaintsUpdate === 'function') {
        console.log(`[fetchComplaints] Sending ${updatedComplaints.length} complaints to handler`);
        handleComplaintsUpdate([...updatedComplaints]);
      }
    };

    processComplaints();
  });

  // Return the unsubscribe function
  return () => {
    // Clean up all comment listeners
    updatedComplaints.forEach(complaint => {
      if (complaint.commentsUnsubscribe && typeof complaint.commentsUnsubscribe === 'function') {
        complaint.commentsUnsubscribe();
      }
    });
    // Unsubscribe from the main complaints listener
    if (unsubscribe && typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };
};

const addComment = async (complaintID, comment) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    const commentsCollection = collection(
      db,
      "complaints",
      complaintID,
      "comments"
    );
    
    // Handle both string and object comment parameters
    const newComment = typeof comment === 'string' 
      ? {
          author: user.uid,
          comment: comment,
          timestamp: Date.now(),
        }
      : {
          ...comment,
          author: user.uid, // Ensure author is always set to current user
          timestamp: comment.timestamp || Date.now(),
        };

    await addDoc(commentsCollection, newComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    throw new Error(error.message);
  }
};

const fetchUserById = async (uid) => {
  try {
    const userDocRef = doc(db, "users", uid);
    const userDocSnapshot = await getDoc(userDocRef);
    return userDocSnapshot.data();
  } catch (error) {
    console.error("Error fetching complaints:", error);
    throw error;
  }
};

const updateComplaintStatus = async (complaintId, newStatus, userId) => {
  try {
    if (!Object.values(Statuses).includes(newStatus)) {
      throw new Error('Invalid status value');
    }

    const complaintRef = doc(db, 'complaints', complaintId);
    const complaintDoc = await getDoc(complaintRef);
    
    if (!complaintDoc.exists()) {
      throw new Error('Complaint not found');
    }

    const currentStatus = complaintDoc.data().status;
    
    // Validate status transition
    if (!isValidStatusTransition(currentStatus, newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    // Prepare the update data
    const updateData = {
      status: newStatus,
      lastUpdated: new Date().toISOString()
    };

    // Add to status history
    const statusUpdate = {
      status: newStatus,
      timestamp: new Date().toISOString(),
      updatedBy: userId
    };

    // Use a transaction to ensure data consistency
    await runTransaction(db, async (transaction) => {
      const complaint = await transaction.get(complaintRef);
      if (!complaint.exists()) {
        throw new Error('Complaint does not exist!');
      }

      const currentData = complaint.data();
      const updatedStatusHistory = [
        ...(currentData.statusHistory || []),
        statusUpdate
      ];

      transaction.update(complaintRef, {
        ...updateData,
        statusHistory: updatedStatusHistory
      });
    });

    return { success: true, newStatus };
  } catch (error) {
    console.error('Error updating complaint status:', error);
    throw error;
  }
};

const markAsSolved = async (complaintId, userId) => {
  return updateComplaintStatus(complaintId, Statuses.resolved, userId);
};

const markAsRejected = async (complaintId, userId) => {
  return updateComplaintStatus(complaintId, Statuses.cancelled, userId);
};

const getFollowingFor = async (uid) => {
  try {
    if (!uid) return [];
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    const data = snap.exists() ? snap.data() : {};
    return data.following || [];
  } catch {
    return [];
  }
};

const followUser = async (currentUid, targetUid) => {
  if (!currentUid || !targetUid || currentUid === targetUid) return;
  // Use setDoc with merge to create the doc if it doesn't exist
  await setDoc(
    doc(db, "users", currentUid),
    { following: arrayUnion(targetUid) },
    { merge: true }
  );
  await setDoc(
    doc(db, "users", targetUid),
    { followers: arrayUnion(currentUid) },
    { merge: true }
  );
};

const unfollowUser = async (currentUid, targetUid) => {
  if (!currentUid || !targetUid || currentUid === targetUid) return;
  // Use setDoc with merge so removing a value also works when doc is missing (creates empty arrays)
  await setDoc(
    doc(db, "users", currentUid),
    { following: arrayRemove(targetUid) },
    { merge: true }
  );
  await setDoc(
    doc(db, "users", targetUid),
    { followers: arrayRemove(currentUid) },
    { merge: true }
  );
};

// Stream all complaints except the current user's, newest first
const fetchFeedComplaints = (currentUid, onUpdate) => {
  const complaintsCollection = collection(db, "complaints");
  return onSnapshot(complaintsCollection, async (snapshot) => {
    const items = [];
    for (const snap of snapshot.docs) {
      const data = snap.data();
      if (!data) continue;

      // Determine authorId robustly (schema may vary)
      let authorId = null;
      if (typeof data.reportedBy === 'string') {
        authorId = data.reportedBy;
      } else if (Array.isArray(data.reportedBy) && data.reportedBy.length > 0) {
        authorId = data.reportedBy[0];
      }

      // Skip current user's own posts when authorId is available
      if (authorId && authorId === currentUid) continue;

      const id = snap.id;

      // Safely fetch author
      let authorName = "Unknown user";
      if (authorId) {
        try {
          const authorDocRef = doc(db, "users", authorId);
          const authorDoc = await getDoc(authorDocRef);
          const author = authorDoc.exists() ? authorDoc.data() : null;
          authorName = author?.name || authorName;
        } catch (e) {
          // Leave default authorName
        }
      }

      items.push({
        id,
        ...data,
        authorId: authorId || null,
        authorName,
      });
    }
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    onUpdate(items);
  });
};

// Likes / Upvotes
const likeComplaint = async (complaintId) => {
  const user = auth.currentUser;
  if (!user?.uid || !complaintId) {
    throw new Error('User not authenticated or invalid complaint ID');
  }
  
  const batch = writeBatch(db);
  const likeRef = doc(db, "complaints", complaintId, "likes", user.uid);
  const complaintRef = doc(db, "complaints", complaintId);
  
  // Check if already liked (defensive check)
  const likeSnap = await getDoc(likeRef);
  if (likeSnap.exists()) {
    throw new Error('User has already liked this complaint');
  }
  
  // Add like and increment count in a batch
  batch.set(likeRef, { 
    uid: user.uid, 
    timestamp: serverTimestamp() 
  });
  batch.update(complaintRef, { 
    likesCount: increment(1),
    updatedAt: serverTimestamp()
  });
  
  await batch.commit();
};

const unlikeComplaint = async (complaintId) => {
  const user = auth.currentUser;
  if (!user?.uid || !complaintId) {
    throw new Error('User not authenticated or invalid complaint ID');
  }
  
  const batch = writeBatch(db);
  const likeRef = doc(db, "complaints", complaintId, "likes", user.uid);
  const complaintRef = doc(db, "complaints", complaintId);
  
  // Check if not liked (defensive check)
  const likeSnap = await getDoc(likeRef);
  if (!likeSnap.exists()) {
    throw new Error('User has not liked this complaint');
  }
  
  // Remove like and decrement count in a batch
  batch.delete(likeRef);
  batch.update(complaintRef, { 
    likesCount: increment(-1),
    updatedAt: serverTimestamp()
  });
  
  await batch.commit();
};

const hasUserLiked = async (complaintId, uid) => {
  if (!uid || !complaintId) return false;
  
  try {
    const likeRef = doc(db, "complaints", complaintId, "likes", uid);
    const likeSnap = await getDoc(likeRef);
    return likeSnap.exists();
  } catch (error) {
    console.error('Error checking like status:', error);
    return false; // Default to not liked on error
  }
};

// Report a complaint
const reportComplaint = async (complaintId, userId) => {
  try {
    const complaintRef = doc(db, "complaints", complaintId);
    const reportRef = doc(collection(db, "reports"), `${complaintId}_${userId}`);
    
    // Check if already reported
    const reportDoc = await getDoc(reportRef);
    if (reportDoc.exists()) {
      throw new Error('You have already reported this post');
    }
    
    // Create report
    await setDoc(reportRef, {
      complaintId,
      userId,
      timestamp: serverTimestamp()
    });
    
    // Increment report count
    await updateDoc(complaintRef, {
      reportCount: increment(1)
    });
    
    return true;
  } catch (error) {
    console.error('Error reporting complaint:', error);
    throw error;
  }
};

// Unreport a complaint (undo report)
const unreportComplaint = async (complaintId, userId) => {
  try {
    const complaintRef = doc(db, "complaints", complaintId);
    const reportRef = doc(collection(db, "reports"), `${complaintId}_${userId}`);

    // Check if a report exists
    const reportDoc = await getDoc(reportRef);
    if (!reportDoc.exists()) {
      throw new Error('You have not reported this post');
    }

    // Remove report
    await deleteDoc(reportRef);

    // Decrement report count
    await updateDoc(complaintRef, {
      reportCount: increment(-1)
    });

    return true;
  } catch (error) {
    console.error('Error unreporting complaint:', error);
    throw error;
  }
};

// Check if user has reported a complaint
const hasUserReported = async (complaintId, userId) => {
  try {
    const reportRef = doc(db, "reports", `${complaintId}_${userId}`);
    const reportDoc = await getDoc(reportRef);
    return reportDoc.exists();
  } catch (error) {
    console.error('Error checking report status:', error);
    return false;
  }
};

// Export all functions and Firestore instance
// Calculate user's contribution score (1-100) based on post count relative to other users
const calculateContributionScore = async (userId) => {
  try {
    // Get all complaints and group by user
    const complaintsSnapshot = await getDocs(collection(db, 'complaints'));
    const userPostCounts = {};
    
    // Count posts per user
    complaintsSnapshot.forEach(doc => {
      const complaint = doc.data();
      const userId = complaint.userId;
      userPostCounts[userId] = (userPostCounts[userId] || 0) + 1;
    });
    
    // Convert to array for sorting
    const userStats = Object.entries(userPostCounts).map(([userId, postCount]) => ({
      userId,
      postCount
      }));
    
    // Sort users by post count
    userStats.sort((a, b) => b.postCount - a.postCount);
    
    // Find current user's rank
    const userIndex = userStats.findIndex(stat => stat.userId === userId);
    const totalUsers = userStats.length;
    
    if (userIndex === -1 || totalUsers === 0) return 50; // Default score if no data
    
    // Calculate score based on percentile (higher is better)
    const percentile = ((totalUsers - userIndex) / totalUsers) * 100;
    
    // Ensure score is between 1-100
    return Math.min(100, Math.max(1, Math.round(percentile)));
  } catch (error) {
    console.error('Error calculating contribution score:', error);
    return 50; // Default score on error
  }
};

// Subscribe to real-time updates for complaints
const subscribeToComplaints = (onUpdate) => {
  const q = collection(db, 'complaints');
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const complaints = [];
    querySnapshot.forEach((doc) => {
      complaints.push({ id: doc.id, ...doc.data() });
    });
    onUpdate(complaints);
  });
  return unsubscribe;
};

export {
  checkAadharExists,
  handleRegistration,
  calculateContributionScore,
  subscribeToComplaints,
  isOfficial,
  handleLogin,
  createComplaint,
  fetchComplaintsByUser,
  findComplaintAuthor,
  fetchComplaints,
  addComment,
  fetchUserById,
  markAsSolved,
  markAsRejected,
  getFollowingFor,
  followUser,
  unfollowUser,
  fetchFeedComplaints,
  likeComplaint,
  unlikeComplaint,
  hasUserLiked,
  reportComplaint,
  unreportComplaint,
  hasUserReported,
};