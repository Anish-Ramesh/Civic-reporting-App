import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/Firebase";
import {
  addComment,
  fetchFeedComplaints,
  followUser,
  getFollowingFor,
  unfollowUser,
  fetchUserById,
  likeComplaint,
  unlikeComplaint,
  hasUserLiked,
  reportComplaint,
  hasUserReported,
  unreportComplaint,
} from "../utils/FirebaseFunctions.jsx";
import { Statuses, statusColors } from "../utils/enums";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/Firebase";
import { Clock, X, CheckCircle, XCircle, ChevronDown, ChevronUp, MessageSquare, AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react';
import { watchLiveFeed } from "../utils/liveStreaming";

const timeAgo = (ts) => {
  if (!ts) return "";
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (!t) return "";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const StatusBadge = ({ status }) => {
  const statusText = {
    'pending': 'Pending',
    'inProgress': 'In Progress',
    'solved': 'Solved',
    'rejected': 'Rejected'
  }[status] || status;
  
  const colorKey = Object.keys(Statuses).find((k) => Statuses[k] === status);
  return (
    <span
      className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[colorKey] || 'bg-gray-100 text-gray-800'}`}
    >
      {statusText}
    </span>
  );
};

const explorerBaseFor = (chainId) => {
  switch (Number(chainId)) {
    case 1: return 'etherscan.io';
    case 5: return 'goerli.etherscan.io';
    case 11155111: return 'sepolia.etherscan.io';
    case 10: return 'optimistic.etherscan.io';
    case 11155420: return 'sepolia-optimism.etherscan.io';
    default: return 'etherscan.io';
  }
};

const FeedCard = ({ item, currentUid, following, onFollow, onUnfollow, onLocalLikeChange }) => {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [authors, setAuthors] = useState({});
  const [liked, setLiked] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportCount, setReportCount] = useState(item.reportCount || 0);
  const [likesCount, setLikesCount] = useState(item.likesCount || 0);
  const [isReporting, setIsReporting] = useState(false);

  useEffect(() => {
    if (!commentsOpen || !item.id) return;
    
    const commentsCol = collection(db, "complaints", item.id, "comments");
    const unsub = onSnapshot(commentsCol, async (snap) => {
      try {
        console.log('Comments snapshot received, docs count:', snap.docs.length);
        const commentsData = [];
        
        for (const doc of snap.docs) {
          const data = doc.data();
          console.log('Raw comment data:', data);
          if (!data) continue;
          
          try {
            // Handle both comment formats
            const comment = {
              id: doc.id,
              // Handle both 'text' and 'comment' fields
              text: data.text || data.comment || '',
              // Use serverTimestamp if available, otherwise use current time
              timestamp: data.timestamp?.toDate?.()?.getTime() || data.timestamp || Date.now(),
              // Handle both 'userId' and 'author' fields
              userId: data.userId || data.author || '',
              // Handle both 'userName' and fetching from user document
              userName: data.userName || ''
            };
            
            console.log('Processed comment:', comment);
            
            // If we don't have a username, try to fetch it
            if (!comment.userName && comment.userId) {
              try {
                const userData = await fetchUserById(comment.userId);
                comment.userName = userData?.name || 'Anonymous';
                console.log('Fetched user data for comment:', comment.userId, userData);
              } catch (error) {
                console.error('Error fetching user data:', error);
                comment.userName = 'Anonymous';
              }
            } else if (!comment.userName) {
              comment.userName = 'Anonymous';
            }
            
            // Ensure we have all required fields
            if (comment.text && comment.timestamp) {
              commentsData.push(comment);
            } else {
              console.warn('Skipping invalid comment:', comment);
            }
          } catch (error) {
            console.error('Error processing comment:', error, data);
            // Skip this comment if there's an error
            continue;
          }
        }
        
        // Sort by timestamp (oldest first)
        commentsData.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        console.log('Final comments array:', commentsData);
        setComments(commentsData);
      } catch (error) {
        console.error('Error in comments listener:', error);
      }
    });
    
    return () => unsub();
  }, [commentsOpen, item.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentUid) return;
      try {
        const h = await hasUserLiked(item.id, currentUid);
        if (mounted) setLiked(h);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [currentUid, item.id]);

  const isFollowing = following.has(item.authorId);
  const canFollow = currentUid && item.authorId && currentUid !== item.authorId;
  
  // Check if user has reported this post
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentUid) return;
      try {
        const h = await hasUserReported(item.id, currentUid);
        if (mounted) setReported(h);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [currentUid, item.id]);
  
  // Update local report count when item changes
  useEffect(() => {
    setReportCount(item.reportCount || 0);
  }, [item.reportCount]);
  
  const toggleReport = async () => {
    if (!currentUid || isReporting) return;
    setIsReporting(true);
    const wasReported = reported;
    const prevCount = reportCount;
    try {
      // Optimistic UI
      if (wasReported) {
        setReported(false);
        setReportCount(Math.max(0, prevCount - 1));
        await unreportComplaint(item.id, currentUid);
      } else {
        setReported(true);
        setReportCount(prevCount + 1);
        await reportComplaint(item.id, currentUid);
      }
    } catch (error) {
      console.error('Error toggling report:', error);
      // Revert on error
      setReported(wasReported);
      setReportCount(prevCount);
    } finally {
      setIsReporting(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || !currentUid) return;
    
    try {
      // Get current user data first
      const currentUser = await fetchUserById(currentUid);
      
      const commentData = {
        text: text,
        timestamp: Date.now(),
        userId: currentUid,
        userName: currentUser?.name || 'Anonymous',
        // Include both userId/author and text/comment for backward compatibility
        comment: text,
        author: currentUid
      };
      
      console.log('Submitting comment:', commentData);
      await addComment(item.id, commentData);
      setCommentText("");
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const [isLiking, setIsLiking] = useState(false);

  const toggleLike = async () => {
    if (!currentUid || isLiking) return;
    
    setIsLiking(true);
    const wasLiked = liked;
    const previousCount = likesCount;
    
    try {
      // Optimistic update
      setLiked(!wasLiked);
      const newCount = wasLiked ? Math.max(0, likesCount - 1) : likesCount + 1;
      setLikesCount(newCount);
      
      // Update parent component
      onLocalLikeChange?.(item.id, wasLiked ? -1 : 1);
      
      // Make the actual API call
      if (wasLiked) {
        await unlikeComplaint(item.id);
      } else {
        await likeComplaint(item.id);
      }
      
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert on error
      setLiked(wasLiked);
      setLikesCount(previousCount);
      onLocalLikeChange?.(item.id, wasLiked ? 0 : 0); // No net change
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <article className="bg-white/90 ring-1 ring-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate cursor-pointer" onClick={() => window.location.assign(`/profile?uid=${item.authorId}`)}>{item.authorName}</p>
          <p className="text-xs text-gray-500">{timeAgo(item.timestamp)} • {item.location?.name || "Unknown"}</p>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status={item.status} />
          {item.onChain?.enabled && (
            <a 
              href={`https://${explorerBaseFor(item.onChain.chainId)}/tx/${item.onChain.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Certified</span>
              <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-70" />
            </a>
          )}
          {reportCount >= 15 && (
            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
              Multiple reports - content may be inaccurate
            </span>
          )}
          <div className="flex items-center space-x-2 ml-auto">
            {currentUid && currentUid !== item.authorId && (
              <button 
                onClick={toggleReport} 
                disabled={isReporting}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  reported 
                    ? 'bg-red-200 text-red-700 hover:bg-red-300' 
                    : 'bg-red-100 text-red-600 hover:bg-red-200'
                }`}
              >
                {reported ? 'Unreport' : 'Report'}
              </button>
            )}
            {canFollow && (
              <button 
                onClick={() => (isFollowing ? onUnfollow(item.authorId) : onFollow(item.authorId))}
                className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200"
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{item.reason}</p>
        
        {/* Audio Player */}
        {item.audioUrl && (
          <div className="mt-3">
            <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg">
              <audio 
                src={item.audioUrl} 
                controls 
                className="h-8 w-full"
                controlsList="nodownload"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Voice note
            </p>
          </div>
        )}
        
        {/* Image/Video */}
        {item.mediaPath && (
          <div className="bg-gray-50">
            <img src={item.mediaPath} alt="attachment" className="w-full max-h-[28rem] object-cover" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-2 flex items-center gap-4 text-sm text-gray-600">
        <button
          className={`flex items-center gap-1 ${liked ? "text-emerald-700" : "hover:text-emerald-700"}`}
          onClick={toggleLike}
        >
          <span>{liked ? "▲" : "△"}</span>
          <span>{likesCount}</span>
        </button>
        <button className="hover:text-emerald-700" onClick={() => setCommentsOpen((v) => !v)}>
          {commentsOpen ? "Hide" : "View"} comments
        </button>
      </div>

      {/* Comments */}
      {commentsOpen && (
        <div className="px-4 pb-4">
          <ul className="space-y-2">
            {Array.isArray(comments) && comments.map((comment) => {
              try {
                // Skip if comment is not an object or is null/undefined
                if (!comment || typeof comment !== 'object') {
                  console.warn('Invalid comment format:', comment);
                  return null;
                }
                
                // Safely extract properties with defaults
                const id = comment.id || `comment-${Math.random().toString(36).substr(2, 9)}`;
                const userName = typeof comment.userName === 'string' ? comment.userName : 'Anonymous';
                const timestamp = typeof comment.timestamp === 'number' ? comment.timestamp : 0;
                
                // Handle text field which might be an object or JSON string
                let text = '';
                try {
                  // First try to parse if it's a JSON string
                  let textObj = comment.text || comment.comment;
                  
                  if (typeof textObj === 'string') {
                    // Try to parse as JSON, if it fails, use as is
                    try {
                      textObj = textObj.trim().startsWith('{') ? JSON.parse(textObj) : textObj;
                    } catch (e) {
                      // Not a JSON string, use as is
                      text = textObj;
                    }
                  }
                  
                  // Handle object case
                  if (typeof textObj === 'object' && textObj !== null) {
                    text = textObj.text || textObj.comment || '';
                  } else if (typeof textObj === 'string') {
                    text = textObj;
                  }
                  
                  // Clean up any extra whitespace
                  text = text.trim();
                } catch (error) {
                  console.error('Error processing comment text:', error, comment);
                  text = '';
                }
                
                // Skip if we don't have text to display
                if (!text) {
                  console.warn('Comment has no text:', comment);
                  return null;
                }
                
                return (
                  <li key={id} className="text-sm">
                    <span className="font-medium text-gray-900">{userName}</span>
                    <span className="text-gray-500"> — {timeAgo(timestamp)}</span>
                    <div className="text-gray-800 whitespace-pre-wrap">{text}</div>
                  </li>
                );
              } catch (error) {
                console.error('Error rendering comment:', error, comment);
                return null;
              }
            })}
            {(!Array.isArray(comments) || comments.length === 0) && (
              <li className="text-sm text-gray-500 italic">No comments yet</li>
            )}
          </ul>
          <form onSubmit={handleAddComment} className="mt-3 flex items-center gap-2">
            <input
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Add a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </article>
  );
};

const Feed = () => {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [following, setFollowing] = useState(new Set());
  const [followingOnly, setFollowingOnly] = useState(false);
  const [area, setArea] = useState("");
  const [sortBy, setSortBy] = useState("trending"); // new | old | trending
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        navigate("/citizen-login");
        return;
      }
      setUser(u);
      const f = await getFollowingFor(u.uid);
      setFollowing(new Set(f));
      const unsubscribe = fetchFeedComplaints(u.uid, setItems);
      return () => unsubscribe();
    });
    return () => unsub && unsub();
  }, []);

  // Live feed watcher
  useEffect(() => {
    const unsub = watchLiveFeed((arr) => {
      setLiveItems(Array.isArray(arr) ? arr : []);
    });
    return () => { try { unsub && unsub(); } catch {} };
  }, []);

  const filtered = useMemo(() => {
    let arr = items;
    if (followingOnly) {
      arr = arr.filter((i) => following.has(i.authorId));
    }
    if (area.trim()) {
      const q = area.trim().toLowerCase();
      arr = arr.filter((i) => (i.location?.name || "").toLowerCase().includes(q));
    }
    arr = arr.filter((i) => (i.reportCount || 0) < 30 || i.authorId === user?.uid);
    if (sortBy === "old") {
      arr = [...arr].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    } else if (sortBy === "trending") {
      arr = [...arr].sort((a, b) => {
        const ta = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp || 0;
        const tb = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp || 0;
        const ha = Math.max(1 / 60, (Date.now() - ta) / 3600000);
        const hb = Math.max(1 / 60, (Date.now() - tb) / 3600000);
        const sa = (a.likesCount || 0) / ha;
        const sb = (b.likesCount || 0) / hb;
        return sb - sa;
      });
    } else {
      arr = [...arr].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    return arr;
  }, [items, followingOnly, area, sortBy, following]);

  const handleFollow = async (targetUid) => {
    if (!user) return;
    await followUser(user.uid, targetUid);
    const f = await getFollowingFor(user.uid);
    setFollowing(new Set(f));
  };

  const handleUnfollow = async (targetUid) => {
    if (!user) return;
    await unfollowUser(user.uid, targetUid);
    const f = await getFollowingFor(user.uid);
    setFollowing(new Set(f));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-50 via-white to-slate-50">
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-24 sm:px-6 lg:px-8">

        {/* Live Now section */}
        {liveItems.length > 0 && (
          <section className="mb-4">
            <h2 className="text-sm font-semibold text-emerald-700 mb-2">Live now</h2>
            <div className="space-y-2">
              {liveItems.map(l => (
                <div key={l.sessionId} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-emerald-900 truncate">{l.title || 'Live'} — {l.hostName || 'Host'}</div>
                    <div className="text-xs text-emerald-700 truncate">Tap to watch</div>
                  </div>
                  <button
                    onClick={() => navigate(`/live/${l.sessionId}`)}
                    className="text-xs px-3 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Join Live
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Controls */}
        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              placeholder="Filter by area or locality"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
              <option value="trending">Trending</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              checked={followingOnly}
              onChange={(e) => setFollowingOnly(e.target.checked)}
            />
            Following only
          </label>
        </section>

        {/* Feed list */}
        <section className="space-y-4">
          {filtered.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              currentUid={user?.uid}
              following={following}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onLocalLikeChange={(id, delta) => {
                // keep local items array in sync for trending sort
                setItems((prev) => prev.map((it) => it.id === id ? { ...it, likesCount: Math.max(0, (it.likesCount || 0) + delta) } : it));
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-600 py-10">No posts yet matching your filters.</div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Feed;
