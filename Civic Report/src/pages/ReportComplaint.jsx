import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, MapPin, X, AlertTriangle, Mic, Trash2, Wifi, WifiOff, Clock, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SpinnerModal from '../components/SpinnerModal';
import { Button } from '../components/ui/button.jsx';
import { Textarea } from '../components/ui/textarea';
import VoiceRecorder from '../components/VoiceRecorder';
import MobileSelect from '../components/ui/MobileSelect.jsx';
import { registerComplaintOnChain, verifyComplaintIntegrity } from '../utils/blockchain';
import { db } from '../utils/Firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Utils
import { auth } from '../utils/Firebase';
import { createComplaint, isOfficial } from '../utils/FirebaseFunctions';
import { Statuses } from '../utils/enums';
import { saveOfflineComplaint, checkOnlineStatus, getPendingComplaints } from '../utils/offlineStorage';
import { useMediaCapture } from '../contexts/MediaCaptureContext.jsx';
import { analyzeMedia, extractVideoSnapshot } from '../utils/ai';
import { geocodePlaceName } from '../utils/geocode';

const ReportComplaint = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingComplaints, setPendingComplaints] = useState([]);
  const [location, setLocation] = useState({
    name: '',
    lat: null,
    lng: null,
  });
  const [formData, setFormData] = useState({
    reason: '',
    description: '',
    // Legacy single media (kept for backward compat but not used)
    media: null,
    mediaPreview: '',
    mediaType: undefined,
    // New fields
    photos: [], // File[]
    photoPreviews: [], // string[]
    video: null, // File
    videoPreview: '', // string
    audio: null,
  });
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const capturePhotoInputRef = useRef(null);
  const captureVideoInputRef = useRef(null); // for recording via camera
  const selectVideoInputRef = useRef(null);  // for choosing existing video
  const navigate = useNavigate();
  const { pendingVideo, pendingPhotos, clearAll } = useMediaCapture();
  const aiBusyRef = useRef(false);
  const aiRunPendingRef = useRef(false);

  // Blockchain certification (Option B) UI state
  const [chainReady, setChainReady] = useState({ walletDetected: false, contractConfigured: false, ipfsConfigured: false });
  const [lastCertification, setLastCertification] = useState(null); // { txHash, ipfsCid, chainId, onChainId }
  const [verificationStatus, setVerificationStatus] = useState(null); // null, 'verifying', 'verified', 'failed', 'error'
  // Separate AI descriptions
  const [aiVideoDesc, setAiVideoDesc] = useState('');
  const [aiPhotoDesc, setAiPhotoDesc] = useState('');

  // Auto-run AI when a video is available (covers live recordings and uploads)
  useEffect(() => {
    try {
      const hasVideoFile = !!formData.video && (formData.video instanceof File || formData.video instanceof Blob);
      const hasVideoPreview = !!formData.videoPreview;
      if (!aiBusyRef.current && (hasVideoFile || hasVideoPreview)) {
        console.log('[AI Trigger] Video detected. hasFile:', hasVideoFile, 'hasPreview:', hasVideoPreview);
        // Short defer to ensure state has settled
        setTimeout(() => runAIAnalysis(), 0);
      }
    } catch (e) {
      console.warn('Auto AI trigger for video failed:', e);
    }
  }, [formData.video, formData.videoPreview]);

  // Auto-run AI when photos are added/changed
  useEffect(() => {
    try {
      const count = Array.isArray(formData.photos) ? formData.photos.length : 0;
      if (!aiBusyRef.current && count > 0) {
        console.log('[AI Trigger] Photos detected. count:', count);
        // Defer to end of tick to ensure state is committed
        setTimeout(() => runAIAnalysis(), 0);
      }
    } catch (e) {
      console.warn('Auto AI trigger for photos failed:', e);
    }
  }, [formData.photos]);

  useEffect(() => {
    const walletDetected = typeof window !== 'undefined' && !!window.ethereum;
    const contractConfigured = !!import.meta.env.VITE_COMPLAINT_REGISTRY_ADDRESS;
    const ipfsConfigured = !!(import.meta.env.VITE_NFT_STORAGE_TOKEN || import.meta.env.VITE_IPFS_API_KEY);
    setChainReady({ walletDetected, contractConfigured, ipfsConfigured });
  }, []);

  // If a global recording/photo is pending (from Go Live), prefill it here
  useEffect(() => {
    if ((pendingVideo && pendingVideo.blob) || (pendingPhotos && pendingPhotos.length > 0)) {
      try {
        setFormData(prev => {
          const next = { ...prev };
          if (pendingVideo?.blob) {
            const vUrl = URL.createObjectURL(pendingVideo.blob);
            next.video = new File([pendingVideo.blob], 'recording.webm', { type: pendingVideo.mime || pendingVideo.blob.type });
            next.videoPreview = vUrl;
          }
          if (pendingPhotos?.length) {
            const newFiles = pendingPhotos.map((p, idx) => new File([p.blob], `photo_${Date.now()}_${idx}.jpg`, { type: p.mime || p.blob.type }));
            const newUrls = pendingPhotos.map(p => URL.createObjectURL(p.blob));
            next.photos = [...(prev.photos || []), ...newFiles];
            next.photoPreviews = [...(prev.photoPreviews || []), ...newUrls];
          }
          return next;
        });
        // Defer AI run to after state update
        setTimeout(() => runAIAnalysis(), 0);
      } finally {
        clearAll();
      }
    }
  }, [pendingVideo, pendingPhotos, clearAll]);

  const explorerBaseFor = (chainId) => {
    switch (Number(chainId)) {
      case 11155111: // Ethereum Sepolia
        return 'https://sepolia.etherscan.io';
      case 11155420: // Optimism Sepolia
        return 'https://sepolia-optimism.etherscan.io';
      default:
        return '';
    }
  };

  // Trigger native camera for quick capture
  const handleTakePhoto = () => {
    capturePhotoInputRef.current?.click();
  };
  const handleRecordVideo = () => {
    // Trigger native camera recorder via input capture attribute
    captureVideoInputRef.current?.click();
  };

  // New handlers for separate sections
  const handlePhotosChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    const valid = [];
    const previews = [];
    
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        console.warn('Skipping non-image file:', f.name, f.type);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        console.warn('Image too large:', f.name, f.size);
        setErrors(prev => ({ ...prev, media: 'Each image should be less than 10MB' }));
        continue;
      }
      valid.push(f);
      previews.push(URL.createObjectURL(f));
    }
    
    if (!valid.length) {
      console.log('No valid image files selected');
      return;
    }
    
    console.log('Adding photos to form data:', valid.length);
    
    // Use a single state update for better performance
    setFormData(prev => {
      const newPhotos = [...(prev.photos || []), ...valid];
      const newPreviews = [...(prev.photoPreviews || []), ...previews];
      
      const newState = {
        ...prev,
        photos: newPhotos,
        photoPreviews: newPreviews,
      };
      
      console.log('Updated form data with photos:', newState);
      
      // Immediately run AI analysis after state update
      setTimeout(() => {
        console.log('Running AI analysis with photos:', newPhotos.length);
        runAIAnalysis();
      }, 0);
      
      return newState;
    });
    
    setErrors(prev => ({ ...prev, media: '' }));
  };

  const handleVideoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected for video');
      return;
    }
    
    console.log('Video file selected:', file.name, file.type, file.size);
    
    if (!file.type.startsWith('video/')) {
      console.warn('Invalid video file type:', file.type);
      setErrors(prev => ({ ...prev, media: 'Please choose a valid video file (MP4, WebM, etc.)' }));
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      console.warn('Video file too large:', file.size);
      setErrors(prev => ({ ...prev, media: 'Video size should be less than 50MB' }));
      return;
    }
    
    const videoUrl = URL.createObjectURL(file);
    console.log('Video URL created, updating form state...');
    
    try {
      // Update form state with the video file and preview
      await new Promise((resolve) => {
        setFormData(prev => {
          const newState = {
            ...prev,
            video: file,
            videoPreview: videoUrl,
            mediaType: file.type,
            media: file, // For backward compatibility
            mediaPreview: videoUrl, // For backward compatibility
            timestamp: Date.now() // Force re-render
          };
          console.log('Form state updated with video:', newState);
          resolve(newState);
          return newState;
        });
      });
      
      // Clear any previous errors
      setErrors(prev => ({ ...prev, media: '' }));
      
      // Give React a moment to update the DOM
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Run AI analysis
      console.log('Running AI analysis for video...');
      await runAIAnalysis();
      
    } catch (error) {
      console.error('Error processing video:', error);
      toast.error('Failed to process video');
    }
  };

  // Map AI issueType to our reasons list
  const mapIssueTypeToReason = (t) => {
    const s = String(t || '').toLowerCase().trim();
    console.log('Mapping issue type:', s);
    
    const mapping = {
      'pothole': 'Pothole',
      'garbage': 'Garbage',
      'street_light': 'Street Light',
      'streetlight': 'Street Light',
      'water_leakage': 'Water Leakage',
      'waterleak': 'Water Leakage',
      'road_damage': 'Road Damage',
      'roaddamage': 'Road Damage',
      'drainage': 'Drainage Issue',
      'drain': 'Drainage Issue',
      'illegal_dumping': 'Illegal Dumping',
      'illegaldumping': 'Illegal Dumping',
      'traffic_violation': 'Traffic Violation',
      'vandalism': 'Vandalism',
      'encroachment': 'Encroachment',
      'waterlogging': 'Water Logging',
      // Additional drainage/sewage synonyms
      'sewage': 'Drainage Issue',
      'sewer': 'Drainage Issue',
      'waste water': 'Drainage Issue',
      'wastewater': 'Drainage Issue',
      'open drain': 'Drainage Issue',
      'clogged drain': 'Drainage Issue',
      'drain clog': 'Drainage Issue',
      'overflow': 'Drainage Issue',
      'manhole': 'Drainage Issue',
      'stormwater': 'Drainage Issue',
      'stagnant water': 'Drainage Issue',
      'dirty water': 'Drainage Issue'
    };
    
    // Check for direct matches first
    if (mapping[s]) return mapping[s];
    
    // Check for partial matches
    for (const [key, value] of Object.entries(mapping)) {
      if (s.includes(key)) return value;
    }
    
    console.warn('No mapping found for issue type:', s);
    return 'Other';
  };

  // Helper function to combine descriptions using AI
  const combineWithAI = async (existingDesc, newDesc) => {
    try {
      // In a real implementation, this would call an AI service like Gemini
      // For now, we'll use a simple heuristic to combine the descriptions
      const combined = `${existingDesc}. ${newDesc}`;
      
      // Simple cleanup for better readability
      return combined
        .replace(/\.\./g, '.') // Remove double periods
        .replace(/([.!?])\s+([A-Z])/g, '$1 $2') // Fix spacing after punctuation
        .replace(/\s+/g, ' ') // Remove extra spaces
        .trim();
    } catch (error) {
      console.error('Error in combineWithAI:', error);
      return null;
    }
  };

  // Helper function to analyze media and update form
  const analyzeAndUpdateForm = async (photos, videoSnapshot) => {
    if (!photos?.length && !videoSnapshot) {
      console.log('No media provided for analysis');
      return;
    }
    
    const toastId = toast.loading('Analyzing media...');
    console.log('Starting AI analysis with:', JSON.stringify({ 
      photos: photos?.length || 0, 
      hasVideo: !!videoSnapshot,
      videoType: videoSnapshot?.type || 'none'
    }));
    
    try {
      // Process the media and get the AI result
      const analyzeOptions = {
        photoCount: photos?.length || 0,
        hasVideo: !!videoSnapshot,
        videoSize: videoSnapshot?.size || 0
      };
      console.log('Calling analyzeMedia with:', JSON.stringify(analyzeOptions));
      
      const result = await analyzeMedia({ 
        photos: photos || [],
        videoSnapshot: videoSnapshot || null
      });
      
      console.log('AI analysis completed:', {
        hasResult: !!result,
        descriptionLength: result?.description?.length,
        issueType: result?.issueType
      });
      
      if (!result) {
        throw new Error('No result from AI analysis');
      }
      
      // Process form updates based on AI result
      const currentData = formData;
      const updates = {};
      let hasUpdates = false;

      const hasPhotos = Array.isArray(photos) && photos.length > 0;
      const hasVideo = !!videoSnapshot;

      // Prefer structured fields if provided
      const descVideo = (result?.descriptionVideo || '').trim();
      const descPhotos = (result?.descriptionPhotos || '').trim();
      const fallbackDesc = (result?.description || '').trim();

      if (hasVideo && !hasPhotos) {
        setAiVideoDesc(descVideo || fallbackDesc);
      }
      if (hasPhotos && !hasVideo) {
        setAiPhotoDesc(descPhotos || fallbackDesc);
      }

      // Compose final description from separate parts
      const composed = [
        (hasVideo ? (descVideo || fallbackDesc) : aiVideoDesc).trim(),
        (hasPhotos ? (descPhotos || fallbackDesc) : aiPhotoDesc).trim(),
      ].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      if (composed) {
        updates.description = composed;
        hasUpdates = true;
      }
      
      // Handle other updates (reason, location, etc.)
      // Prefer photo-derived issueType if present (i.e., when analyzing photos only)
      if (result?.issueType) {
        const mappedReason = mapIssueTypeToReason(result.issueType);
        if (mappedReason && mappedReason !== 'Other') {
          updates.reason = mappedReason;
          hasUpdates = true;
        } else if (!currentData.reason?.trim()) {
          // Only set 'Other' if no reason currently set
          updates.reason = 'Other';
          hasUpdates = true;
        }
      }
      
      // Apply updates if any
      if (hasUpdates) {
        console.log('Applying AI suggestions:', updates);
        setFormData(prev => ({ ...prev, ...updates }));
        toast.dismiss(toastId);
        toast.success('AI suggestions applied');
      } else {
        console.log('No updates needed based on AI analysis');
        toast.dismiss(toastId);
        toast.info('No new suggestions from AI');
      }
      
      // Handle location separately as it's in a different state
      if (result?.mentionedLocation && (!location.lat || !location.lng)) {
        try {
          console.log('Attempting to geocode location:', result.mentionedLocation);
          const loc = await geocodePlaceName(result.mentionedLocation);
          if (loc?.lat && loc?.lng) {
            console.log('Location geocoded successfully:', loc);
            setLocation({ 
              name: loc.name || result.mentionedLocation, 
              lat: loc.lat, 
              lng: loc.lng 
            });
            toast.success('Location inferred from media');
          }
        } catch (error) {
          console.error('Error geocoding location:', error);
        }
      }
    } catch (error) {
      console.error('Error in analyzeAndUpdateForm:', error);
      toast.dismiss(toastId);
      toast.error('Failed to analyze media. Please try again.');
    }
  };

  // AI analysis runner
  const runAIAnalysis = async () => {
    if (aiBusyRef.current) {
      console.log('AI analysis already in progress; queueing a follow-up run');
      aiRunPendingRef.current = true;
      return;
    }
    
    console.log('runAIAnalysis called');
    
    try {
      aiBusyRef.current = true;
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('No API key configured for Gemini AI');
        return;
      }

      // Get the current form data directly from the state
      const currentFormData = { ...formData };
      console.log('Current form data in runAIAnalysis:', {
        hasPhotos: Array.isArray(currentFormData.photos) && currentFormData.photos.length > 0,
        photoCount: Array.isArray(currentFormData.photos) ? currentFormData.photos.length : 0,
        hasVideo: !!(currentFormData.video || currentFormData.media),
        hasVideoPreview: !!(currentFormData.videoPreview || currentFormData.mediaPreview),
        mediaType: currentFormData.mediaType
      });
      
      // Process photos if any exist; if not, try to reconstruct from previews
      let photoBlobs = Array.isArray(currentFormData.photos) 
        ? currentFormData.photos.filter(photo => {
            // Accept File/Blob, or objects that look like file blobs
            if (photo instanceof File || photo instanceof Blob) return true;
            try {
              return photo && typeof photo.type === 'string' && photo.type.startsWith('image/') && typeof photo.size === 'number' && photo.size > 0;
            } catch { return false; }
          })
        : [];
      if (photoBlobs.length === 0 && Array.isArray(currentFormData.photoPreviews) && currentFormData.photoPreviews.length > 0) {
        try {
          const urls = currentFormData.photoPreviews.slice(0, 3);
          console.log('No File images found; fetching from previews:', urls.length);
          const fetched = await Promise.all(urls.map(async (u, idx) => {
            try {
              const res = await fetch(u);
              const blob = await res.blob();
              return new File([blob], `photo_preview_${idx}.jpg`, { type: blob.type || 'image/jpeg' });
            } catch (e) {
              console.warn('Failed to fetch photo preview', u, e);
              return null;
            }
          }));
          photoBlobs = fetched.filter(Boolean);
        } catch (e) {
          console.warn('Photo previews fetch failed:', e);
        }
      }
      
      // Handle video file - check both video and media fields for backward compatibility
      const videoFile = currentFormData.video || currentFormData.media;
      const videoPreview = currentFormData.videoPreview || currentFormData.mediaPreview;
      const videoType = currentFormData.mediaType?.startsWith('video/') 
        ? currentFormData.mediaType 
        : 'video/mp4'; // Default to mp4 if type not specified
      
      console.log('Media check - photos:', photoBlobs.length, 'video:', !!videoFile, 'videoPreview:', !!videoPreview);
      
      // Build a single combined analysis: photos + optional video snapshot
      let videoSnap = null;
      if (videoFile && (videoFile instanceof File || videoFile instanceof Blob)) {
        console.log('Processing video file...');
        try {
          console.log('Extracting video snapshot...');
          videoSnap = await extractVideoSnapshot(videoFile);
          if (!videoSnap) throw new Error('Failed to extract video snapshot');
          console.log('Video snapshot created.');
        } catch (error) {
          console.error('Failed to process video:', error);
          toast.error('Failed to process video for analysis');
        }
      } else if (videoPreview) {
        console.log('Found video preview, attempting to fetch video...');
        try {
          console.log('Fetching video from preview URL:', videoPreview.substring(0, 100) + '...');
          const response = await fetch(videoPreview);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const videoBlob = await response.blob();
          console.log('Fetched video blob, creating File object...');
          const vf = new File([videoBlob], 'recorded-video.mp4', { type: videoType });
          console.log('Extracting snapshot from fetched video...');
          videoSnap = await extractVideoSnapshot(vf);
          if (!videoSnap) throw new Error('Failed to extract snapshot from fetched video');
          console.log('Video snapshot created from preview.');
        } catch (error) {
          console.error('Failed to process video from preview:', error);
          toast.error('Failed to process recorded video');
        }
      }

      // If we have neither valid photos nor a video snapshot, bail out
      if (photoBlobs.length === 0 && !videoSnap) {
        console.log('No valid media available for analysis');
        return;
      }

      // Single AI call combining all available media
      try {
        console.log('Analyzing combined media:', { photos: photoBlobs.length, hasVideo: !!videoSnap });
        await analyzeAndUpdateForm(photoBlobs, videoSnap);
      } catch (error) {
        console.error('Error during combined media analysis:', error);
        toast.error('Failed to analyze media');
      }
      
      // Done
    } catch (error) {
      console.error('Error in AI analysis flow:', error);
      toast.error('Error analyzing media');
    } finally {
      aiBusyRef.current = false;
      if (aiRunPendingRef.current) {
        console.log('Running queued AI analysis now');
        aiRunPendingRef.current = false;
        setTimeout(() => runAIAnalysis(), 0);
      }
    }
  };

  // Load pending complaints
  const loadPendingComplaints = async () => {
    try {
      const complaints = await getPendingComplaints();
      setPendingComplaints(complaints || []);
    } catch (error) {
      console.error('Error loading pending complaints:', error);
      toast.error('Failed to load pending complaints');
    }
  };

  // Handle offline complaint sync
  const handleSyncNow = async () => {
    if (!navigator.onLine) {
      toast.warning('You need to be online to sync complaints');
      return;
    }

    setIsSyncing(true);
    const toastId = toast.loading('Syncing pending complaints...');
    
    try {
      const result = await checkOnlineStatus();
      toast.dismiss(toastId);
      
      if (result.success) {
        if (result.syncedCount > 0) {
          toast.success(`Successfully synced ${result.syncedCount} complaint${result.syncedCount !== 1 ? 's' : ''}`);
        } else {
          toast.info('No pending complaints to sync');
        }
        await loadPendingComplaints(); // Refresh the list
      } else {
        const errorMsg = result.message || 'Failed to sync some complaints. They will be retried later.';
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error syncing complaints:', error);
      toast.dismiss(toastId);
      toast.error('Failed to sync complaints: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Update online status and sync when back online
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      try {
        await checkOnlineStatus();
      } catch (error) {
        console.error('Error during online sync:', error);
      }
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Listen to offline storage events to refresh the pending list
    window.addEventListener('offlineComplaintAdded', loadPendingComplaints);
    window.addEventListener('offlineComplaintSynced', loadPendingComplaints);

    // Initial check: respect the actual connectivity state
    setIsOnline(navigator.onLine);
    // Load any pending complaints initially
    loadPendingComplaints();
    // If currently online, attempt a background sync
    if (navigator.onLine) {
      checkOnlineStatus().catch((e) => console.warn('Initial sync failed:', e));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlineComplaintAdded', loadPendingComplaints);
      window.removeEventListener('offlineComplaintSynced', loadPendingComplaints);
    };
  }, []);

  // Auth guard: allow any authenticated citizen to report.
  // Redirect unauthenticated users to citizen login and officials to their dashboard.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        navigate('/citizen-login');
        return;
      }

      try {
        const isUserOfficial = await isOfficial(user.uid);
        if (isUserOfficial) {
          navigate('/official-dashboard');
        }
        // If not official, remain on this page (citizen reports are allowed)
      } catch (e) {
        // In case role check fails, still allow access for authenticated users
        // Optionally log error
        // console.warn('Role check failed', e);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Handle location detection
  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      const errorMsg = 'Geolocation is not supported by your browser. Please try a different browser or enter the location manually.';
      toast.error(errorMsg);
      setErrors(prev => ({
        ...prev,
        location: errorMsg
      }));
      return;
    }

    setIsLoading(true);
    
    // Clear any previous location errors
    setErrors(prev => ({ ...prev, location: '' }));
    
    // Helper: process location result
    const handleSuccess = async (coords) => {
      try {
        const { latitude, longitude, accuracy } = coords;
        const newLocation = {
          name: 'Current Location',
          lat: latitude,
          lng: longitude,
          accuracy: accuracy
        };
        if (accuracy > 100) {
          toast.warning('Your location accuracy is low. For best results, try moving to an open area.');
        }
        // Try to get address details from OpenStreetMap
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'CivicReport/1.0 (contact@example.com)' } }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.display_name) {
              newLocation.name = data.display_name || data.address?.road || data.address?.suburb || data.address?.city || 'Current Location';
            }
          }
        } catch {}
        setLocation(newLocation);
        toast.success('Location detected successfully');
      } finally {
        setIsLoading(false);
      }
    };

    // Try Capacitor Geolocation on native platforms first
    try {
      const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
      if (isNative) {
        // Dynamically import to avoid bundling error on web if plugin not installed
        const geoMod = await import('@capacitor/geolocation');
        const { Geolocation } = geoMod;
        // Request permissions
        await Geolocation.requestPermissions();
        // Get current position
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        await handleSuccess(position.coords);
        return;
      }
    } catch (nativeErr) {
      console.warn('Native geolocation plugin failed or not installed, falling back to web geolocation.', nativeErr);
      // Fall through to web geolocation
    }

    // Set a timeout for the web geolocation request
    const geolocationTimeout = setTimeout(() => {
      const errorMsg = 'Location detection is taking too long. Please check your internet connection and try again.';
      toast.error(errorMsg);
      setErrors(prev => ({
        ...prev,
        location: errorMsg
      }));
      setIsLoading(false);
    }, 10000);

    const geolocationOptions = {
      enableHighAccuracy: true,  // Try to use GPS if available
      timeout: 10000,           // 10 second timeout
      maximumAge: 0             // Don't use a cached position
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(geolocationTimeout);
        try {
          await handleSuccess(position.coords);
        } catch (error) {
          console.error('Error processing location:', error);
          const errorMsg = error.message || 'Failed to process location. Please try again.';
          toast.error(errorMsg);
          setErrors(prev => ({
            ...prev,
            location: errorMsg
          }));
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        clearTimeout(geolocationTimeout);
        console.error('Geolocation error:', error);
        
        let errorMessage = 'Failed to detect location';
        let errorDetails = '';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access was denied';
            errorDetails = 'Please allow location permission when prompted. If already blocked, enable it in your browser/app settings and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable';
            errorDetails = 'Your location could not be determined. Please check your device location settings and try again.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            errorDetails = 'Please check your internet connection and try again.';
            break;
          default:
            errorMessage = 'Location error';
            errorDetails = 'An unknown error occurred while detecting your location.';
        }
        
        // Show toast with the main error
        toast.error(errorMessage);
        
        // Set detailed error in the form
        setErrors(prev => ({
          ...prev,
          location: `${errorMessage}. ${errorDetails}`
        }));
        
        setIsLoading(false);
      },
      geolocationOptions
    );
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/quicktime'];
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      setErrors({
        ...errors,
        media: 'Please upload a valid image (JPEG, PNG, JPG) or video (MP4, MOV)',
      });
      return;
    }

    // Validate file size (10MB max for images, 50MB for videos)
    const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrors({
        ...errors,
        media: isImage 
          ? 'Image size should be less than 10MB' 
          : 'Video size should be less than 50MB',
      });
      return;
    }

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        media: file,
        mediaPreview: reader.result,
        mediaType: isImage ? 'image' : 'video',
      }));
      setErrors((prev) => ({ ...prev, media: '' }));
    };
    reader.readAsDataURL(file);
  };

  // Handle audio recording
  const handleAudioRecorded = (audioBlob) => {
    setFormData(prev => ({
      ...prev,
      audio: audioBlob,
    }));
  };

  const handleClearAudio = () => {
    setFormData(prev => ({
      ...prev,
      audio: null,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!formData.reason.trim()) newErrors.reason = 'Please select a reason';
    if (!formData.description.trim() && !formData.audio) {
      newErrors.description = 'Please provide details or record a voice note';
    }
    if (!location.lat || !location.lng) newErrors.location = 'Please detect location';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      
      // Scroll to the first error
      const firstError = Object.keys(newErrors)[0];
      if (firstError) {
        const element = document.querySelector(`[name="${firstError}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus({ preventScroll: true });
        }
      }
      
      toast.error('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const complaintData = {
        reason: formData.reason.trim(),
        description: formData.description.trim(),
        // legacy single media (kept for compatibility in backend)
        media: formData.media,
        mediaType: formData.mediaType,
        // new fields
        photos: formData.photos || [],
        video: formData.video || null,
        audio: formData.audio,
        location: {
          ...location,
          name: location.name || 'Unknown Location',
        },
        status: Statuses.inProgress,
        timestamp: new Date().toISOString(),
        reportedBy: auth.currentUser.uid,
      };
      
      // Helper: timeout for network requests (mobile might report online but be unreachable)
      const withTimeout = (promise, ms = 8000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms))
        ]);
      };

      // Quick connectivity probe: some Android WebViews report online even without real connectivity.
      const isReallyOnline = async () => {
        if (!navigator.onLine) return false;
        try {
          // Use a fast, cache-busted request that should succeed when truly online
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2000);
          // Use Google generate_204 which returns quickly; ignore CORS by no-cors mode.
          await fetch('https://www.gstatic.com/generate_204', {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: ctrl.signal,
          });
          clearTimeout(t);
          return true; // If fetch didn't throw, we consider it reachable
        } catch {
          return false;
        }
      };

      const actuallyOnline = await isReallyOnline();
      // Show loading toast based on actual connectivity probe
      const toastId = toast.loading(actuallyOnline ? 'Submitting your complaint...' : 'Saving complaint for later submission...');

      try {
        if (actuallyOnline) {
          // Try to submit; if it fails or times out, fall back to offline save
          const created = await withTimeout(createComplaint(complaintData));
          toast.dismiss(toastId);
          toast.success('Complaint submitted successfully!');

          // Fire-and-forget: also attempt to register on-chain if configured
          // This does not block the UI flow and failures are logged silently
          try {
            const onChainId = Math.floor(Date.now() / 1000); // unix seconds
            // Best-effort URLs from Firebase result
            const mediaUrl = created?.mediaUrl || '';
            const audioUrl = created?.audioUrl || '';
            // Attempt on-chain registration and then persist on-chain info back to Firestore
            registerComplaintOnChain({
              id: onChainId,
              reason: complaintData.reason,
              description: complaintData.description,
              location: complaintData.location,
              reporterUid: complaintData.reportedBy,
              mediaUrl,
              audioUrl,
            })?.then(async (res) => {
              if (!res) return;
              const { txHash, ipfsCid, chainId } = res;
              try {
                await updateDoc(doc(db, 'complaints', created.id), {
                  onChain: {
                    enabled: true,
                    txHash,
                    ipfsCid,
                    onChainId,
                    chainId,
                    certifiedAt: new Date().toISOString(),
                  },
                });
                toast.success('Complaint certified on-chain');
                setLastCertification({ txHash, ipfsCid, chainId, onChainId });
              } catch (uErr) {
                console.warn('Failed to persist on-chain info:', uErr?.message || uErr);
              }
            });
          } catch (e) {
            console.warn('Blockchain registration skipped/failed:', e?.message || e);
          }
        } else {
          // Offline path
          await saveOfflineComplaint(complaintData);
          toast.dismiss(toastId);
          toast.success('Complaint saved for submission when you\'re back online!');
        }

        // Reset form
        setFormData({
          reason: '',
          description: '',
          media: null,
          mediaPreview: '',
          mediaType: undefined,
          photos: [],
          photoPreviews: [],
          video: null,
          videoPreview: '',
          audio: null,
        });
        setLocation({
          name: '',
          lat: null,
          lng: null,
        });
        setErrors({});

        // Always navigate to citizen dashboard after submit (online or offline)
        navigate('/citizen-dashboard');
      } catch (error) {
        // Fallback: save offline if submission failed while device thought it was online
        console.warn('Online submission failed, attempting offline save:', error);
        try {
          await saveOfflineComplaint(complaintData);
          toast.dismiss();
          toast.success('Complaint saved for submission when you\'re back online!');

          // Reset form and navigate
          setFormData({
            reason: '',
            description: '',
            media: null,
            mediaPreview: '',
            mediaType: undefined,
            photos: [],
            photoPreviews: [],
            video: null,
            videoPreview: '',
            audio: null,
          });
          setLocation({ name: '', lat: null, lng: null });
          setErrors({});
          navigate('/citizen-dashboard');
        } catch (fallbackErr) {
          console.error('Failed to save complaint offline after submit error:', fallbackErr);
          toast.dismiss();
          toast.error('Failed to submit or save offline. Please try again.');
          throw fallbackErr;
        }
      }
    } catch (error) {
      console.error('Error in form submission:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
  };

  // Format date for display
  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SpinnerModal visible={isLoading} />

      <motion.div
        className="max-w-4xl mx-auto px-4 py-8"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Pending Complaints Panel */}
        {pendingComplaints.length > 0 && (
          <motion.div 
            variants={itemVariants}
            className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium text-yellow-800 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  You have {pendingComplaints.length} offline complaint{pendingComplaints.length !== 1 ? 's' : ''} waiting to be synced
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  These will be automatically submitted when you're back online.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncNow}
                disabled={isSyncing || !isOnline}
                className="whitespace-nowrap"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  'Sync Now'
                )}
              </Button>
            </div>
            
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-2">
              {pendingComplaints.map(complaint => (
                <div 
                  key={complaint.id}
                  className="flex items-start justify-between p-2 bg-white bg-opacity-50 rounded text-sm"
                >
                  <div className="truncate flex-1">
                    <p className="font-medium text-yellow-900 truncate">{complaint.reason}</p>
                    <p className="text-yellow-700 text-xs truncate">
                      {complaint.description.substring(0, 60)}{complaint.description.length > 60 ? '...' : ''}
                    </p>
                    <p className="text-yellow-600 text-xs mt-1">
                      {formatDate(complaint.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Report an Issue</h1>
              <p className="text-gray-600">
                Help us improve the city by reporting traffic violations, road damages, or other issues.
              </p>
            </div>
            <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              isOnline 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {isOnline ? (
                <>
                  <Wifi className="w-4 h-4 mr-1" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 mr-1" />
                  <span>Offline - Saving Locally</span>
                </>
              )}
            </div>
          </div>
          {!isOnline && (
            <div className="mt-3 p-3 bg-blue-50 text-blue-800 text-sm rounded-md">
              <p>You are currently offline. Your complaint will be saved locally and submitted when you're back online.</p>
            </div>
          )}
        </motion.div>

        {/* Blockchain Certification (Option B) */}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Blockchain Certification</h2>
              <span className="text-xs text-gray-500">Optional</span>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className={`p-3 rounded-lg border ${chainReady.walletDetected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                <div className="font-medium">Wallet</div>
                <div>{chainReady.walletDetected ? 'Metamask detected' : 'No crypto wallet detected'}</div>
              </div>
              <div className={`p-3 rounded-lg border ${chainReady.contractConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                <div className="font-medium">Contract</div>
                <div>{chainReady.contractConfigured ? 'Contract address configured' : 'Set VITE_COMPLAINT_REGISTRY_ADDRESS'}</div>
              </div>
              <div className={`p-3 rounded-lg border ${chainReady.ipfsConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                <div className="font-medium">IPFS</div>
                <div>{chainReady.ipfsConfigured ? 'NFT.Storage token configured' : 'Set VITE_NFT_STORAGE_TOKEN or VITE_IPFS_API_KEY'}</div>
              </div>
            </div>

            {lastCertification && (
              <div className="mt-4 space-y-3">
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">
                  <div className="font-medium mb-1">Certified on-chain</div>
                  <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-2">
                    <div>On-chain ID: <span className="font-mono">{lastCertification.onChainId}</span></div>
                    <div>
                      IPFS: {lastCertification.ipfsCid ? (
                        <a className="text-emerald-700 underline" target="_blank" rel="noreferrer" href={`https://${lastCertification.ipfsCid}.ipfs.nftstorage.link/`}>{lastCertification.ipfsCid}</a>
                      ) : '—'}
                    </div>
                    <div>
                      Tx: {lastCertification.txHash ? (
                        (() => { const base = explorerBaseFor(lastCertification.chainId); return base ? <a className="text-emerald-700 underline" target="_blank" rel="noreferrer" href={`${base}/tx/${lastCertification.txHash}`}>{lastCertification.txHash.slice(0,10)}…</a> : <span className="font-mono">{lastCertification.txHash.slice(0,10)}…</span>; })()
                      ) : '—'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-blue-100 bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800">Verify Integrity</span>
                    <button 
                      onClick={async () => {
                        try {
                          setVerificationStatus('verifying');
                          const result = await verifyComplaintIntegrity({
                            ...complaintData,
                            onChain: lastCertification,
                            reportedBy: auth.currentUser?.uid,
                            createdAt: new Date().toISOString(),
                          });
                          
                          if (result.isVerified) {
                            toast.success('Verification successful! Data matches on-chain records.');
                            setVerificationStatus('verified');
                          } else {
                            toast.error('Verification failed: ' + (result.error || 'Data mismatch detected'));
                            setVerificationStatus('failed');
                          }
                        } catch (err) {
                          console.error('Verification error:', err);
                          toast.error('Verification error: ' + (err.message || 'Check console for details'));
                          setVerificationStatus('error');
                        }
                      }}
                      disabled={verificationStatus === 'verifying'}
                      className="text-xs px-3 py-1 bg-white border border-blue-200 rounded-md text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {verificationStatus === 'verifying' ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Verifying...
                        </span>
                      ) : verificationStatus === 'verified' ? (
                        <span className="text-green-600 flex items-center">
                          <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Verified
                        </span>
                      ) : verificationStatus === 'failed' ? (
                        <span className="text-red-600">Failed - Try Again</span>
                      ) : (
                        'Verify Now'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-blue-600">
                    Verify that this complaint's data matches what's stored on the blockchain.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Map Section: shows current detected location on OpenStreetMap */}
        <motion.div variants={itemVariants} className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Location Map</h2>
          {location.lat && location.lng ? (
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
              <div className="aspect-video rounded-lg overflow-hidden">
                <iframe
                  key={`${location.lat},${location.lng}`}
                  title="OpenStreetMap"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent((location.lng - 0.01).toFixed(6))}%2C${encodeURIComponent((location.lat - 0.01).toFixed(6))}%2C${encodeURIComponent((location.lng + 0.01).toFixed(6))}%2C${encodeURIComponent((location.lat + 0.01).toFixed(6))}&layer=mapnik&marker=${location.lat}%2C${location.lng}`}
                  className="w-full h-full border-0"
                />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=5/${location.lat}/${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-gray-600">
              Detect your location to see it on the map.
            </div>
          )}
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-6 pb-4">
          {/* Location Section */}
          <motion.div
            variants={itemVariants}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-primary-600" />
              Location
            </h2>

            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-3 sm:space-y-0">
                  <div className="flex-1 min-w-0 overflow-hidden p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-500">Detected Location</p>
                    <p className="font-medium text-gray-900 break-words whitespace-normal">
                      {location.name || 'Not detected'}
                      {location.accuracy > 100 && (
                        <span className="ml-2 text-xs text-yellow-600">(Low accuracy)</span>
                      )}
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isLoading}
                    className="whitespace-nowrap flex-shrink-0"
                    variant="outline"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    {isLoading ? 'Detecting...' : (location.lat ? 'Update Location' : 'Detect Location')}
                  </Button>
                </div>

                {errors.location && (
                  <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-700">{errors.location}</p>
                        {errors.location.includes('denied') && (
                          <div className="mt-2 text-sm text-red-600">
                            <p>To enable location access:</p>
                            <ol className="list-decimal list-inside mt-1 space-y-1">
                              <li>Click the lock icon in your browser's address bar</li>
                              <li>Find "Site settings" or "Permissions"</li>
                              <li>Change "Location" to "Allow"</li>
                              <li>Refresh the page and try again</li>
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-2">
                  <p>Having trouble with location detection?</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Ensure location services are enabled on your device</li>
                    <li>Try moving to an open area with better GPS signal</li>
                    <li>Check your browser's permission settings for this site</li>
                    <li>Try using a different browser if the issue persists</li>
                  </ul>
                </div>
              </div>

              {errors.location && (
                <p className="text-sm text-red-600 flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  {errors.location}
                </p>
              )}
            </div>
          </motion.div>

          {/* Issue Details Section */}
          <motion.div
            variants={itemVariants}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Issue Details</h2>

            <div className="space-y-6">
              {/* Reason Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Report <span className="text-red-500">*</span>
                </label>
                {/* Mobile: custom select to avoid native Android picker */}
                <div className="md:hidden">
                  <MobileSelect
                    value={formData.reason}
                    onChange={(val) => setFormData({ ...formData, reason: val })}
                    placeholder="Select a reason"
                    className={`${errors.reason ? 'border-red-500' : 'border-gray-300'}`}
                    // name is applied on the trigger for error focus/scroll
                    // eslint-disable-next-line react/no-unknown-property
                    name="reason"
                    options={[
                      { value: '', label: 'Select a reason' },
                      { value: 'Pothole', label: 'Pothole' },
                      { value: 'Garbage', label: 'Garbage' },
                      { value: 'Street Light', label: 'Street Light' },
                      { value: 'Water Leakage', label: 'Water Leakage' },
                      { value: 'Road Damage', label: 'Road Damage' },
                      { value: 'Drainage Issue', label: 'Drainage Issue' },
                      { value: 'Illegal Dumping', label: 'Illegal Dumping' },
                      { value: 'Other', label: 'Other' },
                    ]}
                  />
                </div>
                {/* Desktop/Web: keep native select */}
                <div className="relative hidden md:block">
                  <select
                    name="reason"
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    className={`w-full appearance-none pl-3 pr-10 h-12 text-base border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition ${
                      errors.reason ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select a reason</option>
                    <option value="Pothole">Pothole</option>
                    <option value="Garbage">Garbage</option>
                    <option value="Street Light">Street Light</option>
                    <option value="Water Leakage">Water Leakage</option>
                    <option value="Road Damage">Road Damage</option>
                    <option value="Drainage Issue">Drainage Issue</option>
                    <option value="Illegal Dumping">Illegal Dumping</option>
                    <option value="Other">Other</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                </div>
                {errors.reason && (
                  <p className="mt-1 text-sm text-red-600">{errors.reason}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Please provide details about the issue..."
                  className={`min-h-[100px] ${
                    errors.description ? 'border-red-500' : ''
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Or record a voice note below
                </p>
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description}</p>
                )}
              </div>

              {/* Voice Recorder */}
              <div className="pt-2">
                <VoiceRecorder 
                  onRecordingComplete={handleAudioRecorded}
                  onClearRecording={handleClearAudio}
                />
              </div>
            </div>
          </motion.div>

          {/* Photos Section */}
          <motion.div
            variants={itemVariants}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Add Photos (Optional)</h2>

            <div className="space-y-4">
              {formData.photoPreviews?.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {formData.photoPreviews.map((src, idx) => (
                    <div key={idx} className="relative">
                      <img src={src} alt={`Photo ${idx+1}`} className="w-full h-24 object-cover rounded border" />
                      <button
                        type="button"
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                        onClick={() => {
                          setFormData(prev => {
                            const photos = [...prev.photos];
                            const previews = [...prev.photoPreviews];
                            photos.splice(idx, 1);
                            previews.splice(idx, 1);
                            return { ...prev, photos, photoPreviews: previews };
                          });
                        }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 bg-primary-50 rounded-full">
                    <Camera className="w-6 h-6 text-primary-600" />
                  </div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-primary-600">Click to upload photos</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB each</p>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotosChange}
                accept="image/*"
                multiple
                className="hidden"
              />

              {/* Quick capture hidden inputs */}
              <input
                type="file"
                ref={capturePhotoInputRef}
                onChange={handlePhotosChange}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="outline" onClick={handleTakePhoto}>Take Photo</Button>
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>Choose from device</Button>
              </div>

              {errors.media && <p className="text-sm text-red-600">{errors.media}</p>}
            </div>
          </motion.div>

          {/* Video Section */}
          <motion.div
            variants={itemVariants}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Add Video (Optional)</h2>

            {formData.videoPreview ? (
              <div className="relative">
                <video src={formData.videoPreview} controls className="w-full rounded border" />
                <button
                  type="button"
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
                  onClick={() => setFormData(prev => ({ ...prev, video: null, videoPreview: '' }))}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors" onClick={() => captureVideoInputRef.current?.click()}>
                <p className="text-sm text-gray-600"><span className="font-medium text-primary-600">Click to upload video</span> or record</p>
                <p className="text-xs text-gray-500">MP4/WebM up to 50MB</p>
              </div>
            )}

            <input
              type="file"
              ref={captureVideoInputRef}
              onChange={handleVideoChange}
              accept="video/*"
              capture="environment"
              className="hidden"
            />
            <input
              type="file"
              ref={selectVideoInputRef}
              onChange={handleVideoChange}
              accept="video/*"
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button type="button" variant="outline" onClick={handleRecordVideo}>Record Video</Button>
              <Button type="button" variant="outline" onClick={() => selectVideoInputRef.current?.click()}>Choose from device</Button>
            </div>
          </motion.div>
        </form>
        
        {/* Submit Button - Inline within page width */}
        <div className="mt-6">
          <motion.div 
            variants={itemVariants}
            className="w-full"
          >
            <button
              type="button"
              onClick={handleSubmit}
              className={`w-full py-2.5 px-4 text-sm font-semibold rounded-lg text-white shadow-md ${
                isLoading ? 'bg-red-500' : 'bg-blue-500 hover:bg-blue-600'
              } focus:outline-none focus:ring-2 focus:ring-blue-300 transition-colors`}
              disabled={isLoading}
            >
              {isLoading ? 'SUBMITTING...' : 'SUBMIT REPORT'}
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default ReportComplaint;
