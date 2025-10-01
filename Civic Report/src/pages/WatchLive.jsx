import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { auth } from '../utils/Firebase';
import { Button } from '../components/ui/button.jsx';
import { db } from '../utils/Firebase';
import {
  joinPresence,
  leavePresence,
  watchComments,
  postComment,
  createPeerRef,
  viewerWatchOffer,
  viewerSetAnswer,
  viewerAddIceCandidate,
  viewerWatchHostCandidates,
} from '../utils/liveStreaming';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const WatchLive = () => {
  const { sessionId } = useParams();
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [connected, setConnected] = useState(false);

  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const presenceIntervalRef = useRef(null);
  const unsubscribersRef = useRef([]);

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
    if (!sessionId) return;

    // Basic session status watch
    const sessionRef = doc(db, 'liveSessions', sessionId);
    const unsubSession = onSnapshot(sessionRef, (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'ended') {
        toast.info('Live has ended');
      }
    });
    unsubscribersRef.current.push(unsubSession);

    // Live viewer count via viewers subcollection size
    const unsubViewers = onSnapshot(doc(db, 'liveSessions', sessionId), () => {
      // No-op here; viewer count will be derived from comments or separate card; simplifying.
    });
    unsubscribersRef.current.push(unsubViewers);

    // Comments stream
    unsubscribersRef.current.push(watchComments(sessionId, setComments));

    return () => {
      unsubscribersRef.current.forEach(u => { try { u(); } catch {} });
      unsubscribersRef.current = [];
    };
  }, [sessionId]);

  const connectToLive = async () => {
    try {
      const uid = auth.currentUser?.uid || `guest_${Math.random().toString(36).slice(2, 8)}`;
      const displayName = auth.currentUser?.displayName || 'Viewer';
      // Join presence
      const viewerRef = await joinPresence(sessionId, { uid, displayName });
      presenceIntervalRef.current = setInterval(() => {
        // Touch lastSeenAt via merge write
        if (viewerRef) setDoc(viewerRef, { lastSeenAt: new Date() }, { merge: true });
      }, 20000);

      const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
      pcRef.current = pc;
      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[Viewer PC] connectionState:', pc.connectionState);
      };

      // Handle ICE to host
      const peerId = uid; // one peer per viewer uid
      pc.onicecandidate = async (ev) => {
        if (ev.candidate) {
          await viewerAddIceCandidate({ sessionId, peerId, candidate: ev.candidate.toJSON() });
        }
      };

      // Create initial peer doc so host can post offer
      const peerRef = doc(db, 'liveSessions', sessionId, 'peers', peerId);
      await setDoc(peerRef, { role: 'viewer', createdAt: new Date().toISOString() }, { merge: true });

      // Watch host candidates
      unsubscribersRef.current.push(viewerWatchHostCandidates({ sessionId, peerId, onCandidate: async (c) => {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }}));

      // Wait for host offer then answer
      unsubscribersRef.current.push(viewerWatchOffer({ sessionId, peerId, onOffer: async (offer) => {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await viewerSetAnswer({ sessionId, peerId, answer: answer.toJSON ? answer.toJSON() : answer });
          setConnected(true);
        } catch (e) {
          console.error('Failed to answer offer:', e);
          toast.error('Failed to join live');
        }
      }}));

      toast.success('Joined live');
    } catch (e) {
      console.error('Connect error:', e);
      toast.error('Failed to connect to live');
    }
  };

  const leaveLive = async () => {
    try {
      const uid = auth.currentUser?.uid || '';
      if (uid) await leavePresence(sessionId, uid);
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = null;
      if (pcRef.current) pcRef.current.close();
      pcRef.current = null;
      setConnected(false);
    } catch {}
  };

  const handlePostComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    await postComment(sessionId, {
      uid: auth.currentUser?.uid || 'anon',
      displayName: auth.currentUser?.displayName || 'User',
      text,
    });
    setCommentText('');
  };

  useEffect(() => () => {
    if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    if (pcRef.current) pcRef.current.close();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-3">Live</h1>
      <div className="aspect-video bg-black rounded overflow-hidden mb-3">
        <video ref={videoRef} autoPlay playsInline controls className="w-full h-full object-cover" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        {!connected ? (
          <Button onClick={connectToLive}>Join</Button>
        ) : (
          <Button variant="outline" onClick={leaveLive}>Leave</Button>
        )}
      </div>

      <div className="mt-4">
        <h2 className="font-medium mb-2">Live Comments</h2>
        <div className="h-48 overflow-y-auto border rounded p-2 bg-white">
          {comments.map(c => (
            <div key={c.id} className="text-sm mb-1"><span className="font-semibold">{c.displayName || 'User'}:</span> {c.text}</div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input className="flex-1 border rounded px-2 py-1 text-sm" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Say something..." />
          <Button size="sm" onClick={handlePostComment}>Send</Button>
        </div>
      </div>
    </div>
  );
};

export default WatchLive;
