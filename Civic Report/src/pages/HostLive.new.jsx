import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { auth } from '../utils/Firebase';
import { useMediaCapture } from '../contexts/MediaCaptureContext.jsx';
import { Button } from '../components/ui/button.jsx';
import {
  createLiveSession,
  endLiveSession,
  watchViewerCount,
  watchComments,
  postComment,
  hostAddIceCandidate,
  publishLiveFeed,
  updateLiveFeedStatus,
} from '../utils/liveStreaming';
import { db } from '../utils/Firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

const HostLive = () => {
  const navigate = useNavigate();
  const { setVideo } = useMediaCapture();
  const [sessionId, setSessionId] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isLive, setIsLive] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const peersRef = useRef(new Map());
  const unsubscribersRef = useRef([]);

  const shareUrl = useMemo(() => (sessionId ? `${window.location.origin}/live/${sessionId}` : ''), [sessionId]);

  const buildIceServers = () => {
    const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUser = import.meta.env.VITE_TURN_USERNAME;
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;
    if (turnUrl && turnUser && turnCred) {
      servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
    }
    return servers;
  };

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error('Please login to go live');
      navigate('/citizen-login');
    }
    return () => {
      cleanupPeers();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [navigate]);

  const startRecording = () => {
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp8,opus' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(2000);
    } catch (e) {
      console.warn('Recording not supported:', e);
    }
  };

  const stopRecordingAndSendToReport = async () => {
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        await new Promise(resolve => { rec.onstop = resolve; rec.stop(); });
      }
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      if (blob.size > 0) {
        setVideo(blob, 'video/webm');
        navigate('/report');
      }
    } catch (e) {
      console.warn('Failed to create recording:', e);
    }
  };

  const cleanupPeers = () => {
    peersRef.current.forEach(({ pc, unsubAnswer, unsubViewerCandidates }) => {
      try { pc.close(); } catch {}
      if (unsubAnswer) unsubAnswer();
      if (unsubViewerCandidates) unsubViewerCandidates();
    });
    peersRef.current.clear();
    unsubscribersRef.current.forEach(u => { try { u(); } catch {} });
    unsubscribersRef.current = [];
  };

  const stopLive = async () => {
    try {
      setIsLive(false);
      if (sessionId) {
        await endLiveSession(sessionId);
        await updateLiveFeedStatus(sessionId, 'ended');
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      cleanupPeers();
      await stopRecordingAndSendToReport();
      toast.success('Live ended. Video sent to report.');
    } catch (e) {
      console.error(e);
      toast.error('Failed to stop live');
    }
  };

  const hostRespondToViewer = async (peerDoc) => {
    const peerId = peerDoc.id;
    if (peersRef.current.has(peerId)) return;

    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));

    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        try {
          await hostAddIceCandidate({ sessionId, peerId, candidate: ev.candidate.toJSON() });
        } catch (e) {
          console.warn('Failed to add host ICE candidate', e);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Host PC] connectionState:', pc.connectionState);
    };

    const peerRef = doc(db, 'liveSessions', sessionId, 'peers', peerId);
    const unsubViewerCandidates = onSnapshot(peerRef, (snap) => {
      const data = snap.data();
      (data?.candidatesViewer || []).forEach(async (c) => {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      });
      if (data?.answer && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
      }
    });

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await setDoc(peerRef, { 
      offer: offer.toJSON ? offer.toJSON() : offer, 
      createdAt: new Date().toISOString() 
    }, { merge: true });

    peersRef.current.set(peerId, { pc, unsubViewerCandidates });
  };

  const startLive = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return toast.error('Please login');

      // First get camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment' 
        }, 
        audio: true 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(e => {
          console.error('Video play failed:', e);
          throw new Error('Could not start camera. Please ensure camera permissions are granted.');
        });
      }

      // Create session
      const { sessionId: sid } = await createLiveSession({ 
        hostUid: uid, 
        title: 'Live from ' + (auth.currentUser?.displayName || 'User')
      });
      setSessionId(sid);
      
      // Publish to global live feed
      try {
        await publishLiveFeed({
          sessionId: sid,
          hostUid: uid,
          title: 'Live from ' + (auth.currentUser?.displayName || 'User'),
          hostName: auth.currentUser?.displayName || 'Host',
        });
      } catch (e) {
        console.warn('Failed to publish live feed item', e);
      }

      // Start recording and setup listeners
      startRecording();
      unsubscribersRef.current.push(watchViewerCount(sid, setViewerCount));
      unsubscribersRef.current.push(watchComments(sid, setComments));

      // Watch for new viewers
      const peersCol = collection(db, 'liveSessions', sid, 'peers');
      const unsubPeers = onSnapshot(peersCol, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc;
            const data = d.data();
            if (!data.offer) {
              hostRespondToViewer(d);
            }
          }
        });
      });
      unsubscribersRef.current.push(unsubPeers);

      setIsLive(true);
      toast.success('You are live! Share your link.');
    } catch (e) {
      console.error('Failed to go live:', e);
      toast.error(e.message || 'Failed to start live');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handlePostComment = async () => {
    const text = commentText.trim();
    if (!text || !sessionId) return;
    
    try {
      await postComment(sessionId, {
        uid: auth.currentUser?.uid || 'anon',
        displayName: auth.currentUser?.displayName || 'Host',
        text,
      });
      setCommentText('');
    } catch (e) {
      console.error('Failed to post comment:', e);
      toast.error('Failed to post comment');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">Go Live</h1>
      
      {/* Video Preview */}
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-4 border-2 border-emerald-500">
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center p-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white font-medium">Camera is ready</p>
              <p className="text-sm text-gray-300">Start your live stream when ready</p>
            </div>
          </div>
        )}
      </div>

      {/* Live Controls */}
      <div className="flex flex-col gap-3 mb-4">
        {!isLive ? (
          <Button 
            onClick={startLive}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-full shadow-lg transform hover:scale-105 transition-all"
            size="lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Go Live Now
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
              <span className="font-medium text-red-600">Live Now</span>
              <span className="text-sm bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                {viewerCount} {viewerCount === 1 ? 'viewer' : 'viewers'}
              </span>
            </div>
            <Button 
              variant="destructive" 
              onClick={stopLive}
              className="w-full py-3 font-bold"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              End Live Stream
            </Button>
          </div>
        )}
      </div>

      {sessionId && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-1">Share this link with viewers:</div>
          <div className="p-2 bg-white border rounded text-sm break-all">{shareUrl}</div>
        </div>
      )}

      {/* Comments */}
      <div className="mt-6">
        <h2 className="font-medium text-lg mb-2">Live Comments</h2>
        <div className="h-48 overflow-y-auto border rounded-lg bg-white p-3 mb-3">
          {comments.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            comments.map(comment => (
              <div key={comment.id} className="mb-2 pb-2 border-b last:border-0">
                <div className="font-medium text-sm">{comment.displayName || 'Anonymous'}</div>
                <div className="text-sm text-gray-800">{comment.text}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePostComment()}
            placeholder="Say something..."
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={!isLive}
          />
          <Button 
            onClick={handlePostComment}
            disabled={!isLive || !commentText.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HostLive;
