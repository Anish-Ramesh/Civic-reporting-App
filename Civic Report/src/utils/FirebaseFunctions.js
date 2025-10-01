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
    
    // Upload media file if exists
    if (formData.media) {
      try {
        mediaUrl = await uploadToCloudinary(
          formData.media,
          'complaints/media',
          formData.mediaType === 'video' ? 'video' : 'image'
        );
      } catch (error) {
        console.error('Error uploading media:', error);
        // Continue with complaint creation even if media upload fails
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
      mediaPath: mediaUrl,
      audioPath: audioUrl,
      location: formData.location,
      status: formData.status || Statuses.pending, // Default to pending if not specified
      timestamp: new Date().toISOString(),
      reportedBy: formData.reportedBy,
      likesCount: 0,
      audioUrl: audioUrl || '',
    };
    
    const docRef = await addDoc(collection(db, "complaints"), complaintData);
    console.log('Complaint created with ID:', docRef.id);
    return { id: docRef.id, ...complaintData };
  } catch (error) {
    console.error('Error creating complaint:', error);
    throw new Error(error.message || 'Failed to create complaint');
  }
};

const fetchComplaintsByUser = (uid, handleComplaintsUpdate) => {
  const complaintsRef = collection(db, "complaints");
  const q = query(complaintsRef, where("reportedBy", "==", uid));

  return onSnapshot(q, async (querySnapshot) => {
    const complaints = [];

    for (const complaintDoc of querySnapshot.docs) {
      const complaintData = complaintDoc.data();
      const complaintId = complaintDoc.id;

      const commentsRef = collection(db, "complaints", complaintId, "comments");
      const commentsQuerySnapshot = await getDocs(commentsRef);
      const comments = commentsQuerySnapshot.docs.map((commentDoc) => ({
        id: commentDoc.id,
        ...commentDoc.data(),
      }));

      const complaintWithComments = {
        id: complaintId,
        ...complaintData,
        comments: comments,
      };

      complaints.push(complaintWithComments);
    }

    handleComplaintsUpdate(complaints);
  });
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

const fetchComplaints = async () => {
  try {
    const complaintsCollection = collection(db, "complaints");
    const snapshot = await getDocs(complaintsCollection);
    
    const complaints = [];
    
    for (const complaintDoc of snapshot.docs) {
      try {
        const data = complaintDoc.data();
        let timestamp;
        
        // Handle different timestamp formats
        if (data.timestamp?.toDate) {
          // Firestore Timestamp object
          timestamp = data.timestamp.toDate();
        } else if (typeof data.timestamp === 'string') {
          // ISO string
          timestamp = new Date(data.timestamp);
        } else if (data.timestamp?.seconds) {
          // Firestore timestamp in seconds
          timestamp = new Date(data.timestamp.seconds * 1000);
        } else {
          console.warn('Invalid timestamp format in complaint:', {
            id: complaintDoc.id,
            timestamp: data.timestamp
          });
          continue;
        }
        
        // Skip if timestamp is invalid
        if (isNaN(timestamp.getTime())) {
          console.warn('Invalid timestamp value in complaint:', {
            id: complaintDoc.id,
            timestamp: data.timestamp,
            parsed: timestamp
          });
          continue;
        }
        
        // Get user data if reportedBy exists and is a valid string
        let author = "Unknown user";
        if (typeof data.reportedBy === 'string' && data.reportedBy.trim().length > 0) {
          try {
            const userDoc = await getDoc(doc(db, "users", data.reportedBy));
            if (userDoc.exists()) {
              author = userDoc.data()?.name || author;
            }
          } catch (userError) {
            console.warn('Error fetching user data:', userError);
          }
        } else if (data.reportedBy != null) {
          // Log once for unexpected shapes to aid debugging
          console.warn('Skipping user lookup: invalid reportedBy value', {
            id: complaintDoc.id,
            reportedByType: typeof data.reportedBy,
            reportedBy: data.reportedBy,
          });
        }
        
        complaints.push({
          id: complaintDoc.id,
          ...data,
          author,
          timestamp,
          // Ensure all required fields have default values
          issueType: data.issueType || "Other",
          status: data.status || "pending",
          description: data.description || "No description provided"
        });
        
      } catch (error) {
        console.error('Error processing complaint:', {
          id: complaintDoc.id,
          error: error.message
        });
      }
    }
    
    console.log(`Fetched ${complaints.length} valid complaints`);
    return complaints;
  } catch (error) {
    console.error("Error fetching complaints:", error);
    throw error;
  }
};

// Subscribe to complaints with real-time updates
const subscribeToComplaints = (handleComplaintsUpdate) => {
  const complaintsCollection = collection(db, "complaints");

  return onSnapshot(complaintsCollection, async (complaintsSnapshot) => {
    const updatedComplaints = [];

    for (const complaintDoc of complaintsSnapshot.docs) {
      try {
        const data = complaintDoc.data();
        let timestamp;
        
        // Handle different timestamp formats (same as in fetchComplaints)
        if (data.timestamp?.toDate) {
          timestamp = data.timestamp.toDate();
        } else if (typeof data.timestamp === 'string') {
          timestamp = new Date(data.timestamp);
        } else if (data.timestamp?.seconds) {
          timestamp = new Date(data.timestamp.seconds * 1000);
        } else {
          console.warn('Invalid timestamp format in real-time update:', {
            id: complaintDoc.id,
            timestamp: data.timestamp
          });
          continue;
        }
        
        // Skip if timestamp is invalid
        if (isNaN(timestamp.getTime())) {
          console.warn('Invalid timestamp value in real-time update:', {
            id: complaintDoc.id,
            timestamp: data.timestamp,
            parsed: timestamp
          });
          continue;
        }
        
        // Get user data if reportedBy exists
        let author = "Unknown user";
        if (data.reportedBy) {
          try {
            const userDoc = await getDoc(doc(db, "users", data.reportedBy));
            if (userDoc.exists()) {
              author = userDoc.data()?.name || author;
            }
          } catch (userError) {
            console.warn('Error fetching user data in real-time update:', userError);
          }
        }
        
        updatedComplaints.push({
          id: complaintDoc.id,
          ...data,
          author,
          timestamp,
          // Ensure all required fields have default values
          issueType: data.issueType || "Other",
          status: data.status || "pending",
          description: data.description || "No description provided"
        });
        
      } catch (error) {
        console.error("Error processing real-time complaint update:", {
          id: complaintDoc?.id,
          error: error.message
        });
      }
    }
    
    console.log(`[Real-time] Updated with ${updatedComplaints.length} valid complaints`);
    handleComplaintsUpdate(updatedComplaints);
  });
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

const markAsSolved = async (complaintID) => {
  try {
    const complaint = doc(db, "complaints", complaintID);

    await updateDoc(complaint, { status: Statuses.solved });
  } catch (error) {
    throw new Error(error.message);
  }
};
const markAsRejected = async (complaintID) => {
  try {
    const complaint = doc(db, "complaints", complaintID);

    await updateDoc(complaint, { status: Statuses.rejected });
  } catch (error) {
    throw new Error(error.message);
  }
};

// Social features: following and feed
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
      if (data.reportedBy === currentUid) continue;
      const id = snap.id;
      const authorDoc = await getDoc(doc(db, "users", data.reportedBy));
      const author = authorDoc.exists() ? authorDoc.data() : null;
      items.push({
        id,
        ...data,
        authorId: data.reportedBy,
        authorName: author?.name || "Unknown user",
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

// Export all functions and Firestore instance
// Calculate user's contribution score (1-100) based on post count relative to other users
const calculateContributionScore = async (userId) => {
  try {
    // For demonstration purposes, return a fixed score based on 10 posts
    // This is a simplified version that doesn't query the database
    const baseScore = 75; // Base score for having posts
    const postCount = 10; // Fixed post count
    
    // Cap the score at 100
    const score = Math.min(100, baseScore + (postCount * 2.5));
    
    return Math.max(1, Math.round(score));
  } catch (error) {
    console.error('Error calculating contribution score:', error);
    return 0; // Return 0 on error
  }
};

// Export db for direct Firestore access
export { db } from './Firebase';

export {
  checkAadharExists,
  handleRegistration,
  calculateContributionScore,
  handleLogin,
  uploadToFirebaseStorage,
  uploadToCloudinary,
  createComplaint,
  fetchComplaintsByUser,
  fetchComplaints,
  subscribeToComplaints,
  findComplaintAuthor,
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
  isOfficial,
};