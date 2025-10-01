// Minimal WebRTC + Firestore signaling utilities for Host/Viewer live sessions
// Uses Firestore for: liveSessions metadata, signaling, comments, and presence

import { db } from './Firebase';
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp, onSnapshot,
  collection, addDoc, deleteDoc, query, where, orderBy
} from 'firebase/firestore';

// Firestore paths
// liveSessions/{sessionId}
// liveSessions/{sessionId}/viewers/{viewerId}
// liveSessions/{sessionId}/comments/{commentId}
// liveSessions/{sessionId}/peers/{peerId}  (signaling docs for each viewer)
//   - offer, answer, candidatesHost[], candidatesViewer[]

export async function createLiveSession({ hostUid, title = 'Live' }) {
  const sessionId = `${hostUid}_${Date.now()}`;
  const sessionRef = doc(db, 'liveSessions', sessionId);
  await setDoc(sessionRef, {
    hostUid,
    title,
    status: 'live',
    startedAt: serverTimestamp(),
    endedAt: null,
    viewerCount: 0,
  });
  return { sessionId, sessionRef };
}

export async function endLiveSession(sessionId) {
  const sessionRef = doc(db, 'liveSessions', sessionId);
  await updateDoc(sessionRef, { status: 'ended', endedAt: serverTimestamp() });
}

// Live feed helpers to broadcast active sessions to all users
export async function publishLiveFeed({ sessionId, hostUid, title, hostName }) {
  const feedRef = doc(db, 'liveFeed', sessionId);
  await setDoc(feedRef, {
    sessionId,
    hostUid,
    title: title || 'Live',
    hostName: hostName || 'Host',
    status: 'live',
    startedAt: serverTimestamp(),
    endedAt: null,
  }, { merge: true });
}

export async function updateLiveFeedStatus(sessionId, status) {
  const feedRef = doc(db, 'liveFeed', sessionId);
  await setDoc(feedRef, { status, endedAt: status === 'ended' ? serverTimestamp() : null }, { merge: true });
}

export function watchLiveFeed(cb) {
  const colRef = collection(db, 'liveFeed');
  const q = query(colRef, where('status', '==', 'live'));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    // Sort client-side by startedAt desc (if available)
    items.sort((a, b) => {
      const ta = a?.startedAt?.toMillis ? a.startedAt.toMillis() : (a.startedAt || 0);
      const tb = b?.startedAt?.toMillis ? b.startedAt.toMillis() : (b.startedAt || 0);
      return tb - ta;
    });
    cb(items);
  });
}

export function watchViewerCount(sessionId, cb) {
  const viewersCol = collection(db, 'liveSessions', sessionId, 'viewers');
  return onSnapshot(viewersCol, (snap) => cb(snap.size));
}

export async function joinPresence(sessionId, viewer) {
  const viewerRef = doc(db, 'liveSessions', sessionId, 'viewers', viewer.uid);
  await setDoc(viewerRef, {
    uid: viewer.uid,
    displayName: viewer.displayName || 'Viewer',
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }, { merge: true });
  // Caller should periodically update lastSeenAt
  return viewerRef;
}

export async function leavePresence(sessionId, viewerUid) {
  const viewerRef = doc(db, 'liveSessions', sessionId, 'viewers', viewerUid);
  await deleteDoc(viewerRef).catch(() => {});
}

export function watchComments(sessionId, cb) {
  const commentsCol = collection(db, 'liveSessions', sessionId, 'comments');
  const q = query(commentsCol, orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const comments = [];
    snap.forEach(d => comments.push({ id: d.id, ...d.data() }));
    cb(comments);
  });
}

export async function postComment(sessionId, { uid, displayName, text }) {
  const commentsCol = collection(db, 'liveSessions', sessionId, 'comments');
  await addDoc(commentsCol, {
    uid,
    displayName: displayName || 'User',
    text: String(text || '').slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

// Signaling: Host side manages a peer doc per viewer
export function createPeerRef(sessionId, peerId) {
  return doc(db, 'liveSessions', sessionId, 'peers', peerId);
}

export async function hostCreateOffer({ sessionId, peerId, pc, offer }) {
  const peerRef = createPeerRef(sessionId, peerId);
  await setDoc(peerRef, {
    role: 'host',
    offer: offer,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

export function hostWatchAnswer({ sessionId, peerId, onAnswer }) {
  const peerRef = createPeerRef(sessionId, peerId);
  return onSnapshot(peerRef, (snap) => {
    const data = snap.data();
    if (data?.answer) onAnswer(data.answer);
  });
}

export async function hostAddIceCandidate({ sessionId, peerId, candidate }) {
  const peerRef = createPeerRef(sessionId, peerId);
  const snap = await getDoc(peerRef);
  const prev = snap.exists() ? (snap.data().candidatesHost || []) : [];
  await setDoc(peerRef, { candidatesHost: [...prev, candidate] }, { merge: true });
}

export function hostWatchViewerCandidates({ sessionId, peerId, onCandidate }) {
  const peerRef = createPeerRef(sessionId, peerId);
  return onSnapshot(peerRef, (snap) => {
    const data = snap.data();
    (data?.candidatesViewer || []).forEach(c => onCandidate(c));
  });
}

// Viewer signaling helpers
export async function viewerSetAnswer({ sessionId, peerId, answer }) {
  const peerRef = createPeerRef(sessionId, peerId);
  await setDoc(peerRef, { answer }, { merge: true });
}

export function viewerWatchOffer({ sessionId, peerId, onOffer }) {
  const peerRef = createPeerRef(sessionId, peerId);
  return onSnapshot(peerRef, (snap) => {
    const data = snap.data();
    if (data?.offer) onOffer(data.offer);
  });
}

export async function viewerAddIceCandidate({ sessionId, peerId, candidate }) {
  const peerRef = createPeerRef(sessionId, peerId);
  const snap = await getDoc(peerRef);
  const prev = snap.exists() ? (snap.data().candidatesViewer || []) : [];
  await setDoc(peerRef, { candidatesViewer: [...prev, candidate] }, { merge: true });
}

export function viewerWatchHostCandidates({ sessionId, peerId, onCandidate }) {
  const peerRef = createPeerRef(sessionId, peerId);
  return onSnapshot(peerRef, (snap) => {
    const data = snap.data();
    (data?.candidatesHost || []).forEach(c => onCandidate(c));
  });
}
