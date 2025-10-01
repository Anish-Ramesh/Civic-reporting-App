import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SpinnerModal from "../components/SpinnerModal";
import { auth } from "../utils/Firebase";
import {
  fetchUserById,
  fetchComplaintsByUser,
  followUser,
  unfollowUser,
  getFollowingFor,
  calculateContributionScore,
} from "../utils/FirebaseFunctions.jsx";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../utils/Firebase";
import { toast } from "react-toastify";

// Helper to upload avatar using Cloudinary
async function uploadAvatar(file) {
  try {
    const { uploadToCloudinary } = await import('../utils/FirebaseFunctions');
    const url = await uploadToCloudinary(file, 'avatars', 'image');
    return url;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw new Error('Failed to upload image. Please try again.');
  }
}

const Stat = ({ label, value }) => (
  <div className="text-center">
    <div className="text-base font-semibold text-gray-900">{value}</div>
    <div className="text-xs text-gray-500">{label}</div>
  </div>
);

const Avatar = ({ url, name }) => {
  const initials = useMemo(() => {
    const parts = (name || "?").trim().split(/\s+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || "").join("") || "?";
  }, [name]);
  if (url) {
    return <img src={url} alt={name || "avatar"} className="h-24 w-24 rounded-full object-cover ring-2 ring-white shadow" />;
  }
  return (
    <div className="h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500 to-lime-400 grid place-items-center text-white font-bold text-xl ring-2 ring-white shadow">
      {initials}
    </div>
  );
};

// Simple circular progress gauge for resolution percent
const ResolutionGauge = ({ percent = 0, size = 88, stroke = 8, color = '#059669' }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <svg width={size} height={size} className="block">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#e5e7eb"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="fill-emerald-700 font-bold"
        style={{ fontSize: 14 }}
      >
        {clamped}%
      </text>
    </svg>
  );
};

const Profile = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [me, setMe] = useState(null);
  const [viewUid, setViewUid] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postFilter, setPostFilter] = useState('all'); // all | solved | pending | inProgress | rejected
  const [postSort, setPostSort] = useState('newest'); // newest | oldest | status | media
  const [followingSet, setFollowingSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", bio: "", avatarUrl: "" });
  const fileRef = useRef(null);

  // Derive a normalized issue type similar to analytics
  const deriveIssueType = (c) => {
    const direct = c.issueType || c.category || c.type;
    if (direct && String(direct).trim()) return String(direct).trim();
    const text = `${c.reason || ''} ${c.description || ''}`.toLowerCase();
    const map = [
      { name: 'Garbage', kws: ['garbage','trash','waste','dump','litter'] },
      { name: 'Roads & Potholes', kws: ['pothole','road','street','asphalt'] },
      { name: 'Water Supply', kws: ['water leak','water supply','pipe','pipeline','tap'] },
      { name: 'Sewage/Drainage', kws: ['sewage','drain','overflow','manhole'] },
      { name: 'Street Lights', kws: ['streetlight','street light','lamp','light not working'] },
      { name: 'Electricity', kws: ['electric','power','transformer','wire','shock'] },
      { name: 'Traffic/Signals', kws: ['traffic','signal','jam','congestion'] },
      { name: 'Public Safety', kws: ['accident','crime','safety','harassment','fire','flood'] },
      { name: 'Health & Sanitation', kws: ['sanitation','cleanliness','mosquito','dengue'] },
    ];
    for (const cat of map) {
      if (cat.kws.some(k => text.includes(k))) return cat.name;
    }
    return 'Other';
  };

  // SLA rules (days) by priority and issue type
  const getSlaDays = (c) => {
    const pr = String(c.priority || '').toLowerCase();
    const issue = deriveIssueType(c);
    // Specific issue overrides
    if (/water/i.test(issue)) return 1; // water leak fast
    if (/sewage|drain/i.test(issue)) return 2;
    if (/garbage/i.test(issue)) return 2;
    if (/roads|pothole/i.test(issue)) return 7;
    if (/street/i.test(issue)) return 5;
    // Priority defaults
    if (pr.includes('high')) return 2;
    if (pr.includes('medium')) return 5;
    if (pr.includes('low')) return 10;
    return 5; // fallback
  };

  const getDueDate = (c) => {
    const created = toDate(c.timestamp);
    const days = getSlaDays(c);
    if (isNaN(created)) return null;
    const d = new Date(created);
    d.setDate(d.getDate() + days);
    return d;
  };

  const isOverdue = (c) => {
    if ((c.status || '').toLowerCase() === 'solved') return false;
    const due = getDueDate(c);
    if (!due) return false;
    return new Date() > due;
  };

  const formatShort = (d) => {
    try { return d?.toLocaleDateString?.(undefined, { month: 'short', day: 'numeric' }) || ''; } catch { return ''; }
  };

  const handleEscalate = (c) => {
    const issue = deriveIssueType(c);
    const subject = encodeURIComponent(`[Escalation] ${issue} - ${c.reason || 'Complaint'} (#${c.id})`);
    const body = encodeURIComponent(
      `Hello Team,\n\nThis complaint appears overdue based on SLA.\n\n` +
      `Details:\n` +
      `- ID: ${c.id}\n` +
      `- Issue: ${issue}\n` +
      `- Priority: ${c.priority || 'N/A'}\n` +
      `- Status: ${c.status || 'N/A'}\n` +
      `- Reported: ${toDate(c.timestamp)?.toLocaleString?.() || 'N/A'}\n` +
      `- Due By: ${formatShort(getDueDate(c))}\n` +
      `- Location: ${c.location?.name || c.location?.address || 'N/A'}\n\n` +
      `Please review and escalate as needed.\n\nThanks.`
    );
    const mail = `mailto:?subject=${subject}&body=${body}`;
    try { window.open(mail, '_blank'); } catch {}
  };

  // Resolve the current user and which profile to view
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) return navigate("/citizen-login");
      setMe(u);
      const target = search.get("uid") || u.uid;
      setViewUid(target);
      // preload my following
      const f = await getFollowingFor(u.uid);
      setFollowingSet(new Set(f));
    });
    return () => unsub && unsub();
  }, []);

  // Load profile user and posts
  useEffect(() => {
    if (!viewUid) return;
    let unsubscribePosts = () => {};
    (async () => {
      setLoading(true);
      try {
        const data = await fetchUserById(viewUid);
        // Ensure a doc shape even if user doc missing
        const fallback = data || { name: "Unknown user", bio: "", following: [], followers: [], avatarUrl: "" };
        setUserDoc({ uid: viewUid, ...fallback });
        setProfileForm({ name: fallback.name || "", bio: fallback.bio || "", avatarUrl: fallback.avatarUrl || "" });
      } finally {
        setLoading(false);
      }
    })();
    // subscribe to user's posts
    unsubscribePosts = fetchComplaintsByUser(viewUid, (items) => setPosts(items || []));
    return () => unsubscribePosts && unsubscribePosts();
  }, [viewUid]);

  const isMine = me && viewUid && me.uid === viewUid;
  const isFollowing = useMemo(() => (!isMine && viewUid ? followingSet.has(viewUid) : false), [followingSet, isMine, viewUid]);

  const handleFollowToggle = async () => {
    if (!me || !viewUid || isMine) return;
    if (isFollowing) {
      await unfollowUser(me.uid, viewUid);
    } else {
      await followUser(me.uid, viewUid);
    }
    const f = await getFollowingFor(me.uid);
    setFollowingSet(new Set(f));
    // Refresh profile counts
    const fresh = await fetchUserById(viewUid);
    setUserDoc((prev) => ({ ...prev, ...fresh }));
  };

  const handleSaveProfile = async () => {
    if (!me || !isMine) return;
    const payload = { name: profileForm.name || "", bio: profileForm.bio || "", avatarUrl: profileForm.avatarUrl || "" };
    const ref = doc(db, "users", me.uid);
    // create if not exists, merge fields
    await setDoc(ref, payload, { merge: true });
    const snap = await getDoc(ref);
    setUserDoc({ uid: me.uid, ...(snap.exists() ? snap.data() : payload) });
    setEditMode(false);
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      navigate('/');
    } catch (err) {
      // no-op; could toast err.message
      console.error('Error signing out:', err);
    }
  };

  const handlePickAvatar = () => fileRef.current?.click();
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !me?.uid) return;
    setLoading(true);
    try {
      // Upload the avatar using Cloudinary
      const url = await uploadAvatar(file);
      
      // Update the local state
      setProfileForm((f) => ({ ...f, avatarUrl: url }));
      
      // Save the avatar URL to the user's document in Firestore
      const userRef = doc(db, 'users', me.uid);
      await updateDoc(userRef, { avatarUrl: url });
      
      // Update the local user document to reflect the change
      setUserDoc(prev => ({ ...prev, avatarUrl: url }));
      
      // Show success message
      toast.success('Profile picture updated successfully');
    } catch (err) {
      console.error('Error updating avatar:', err);
      toast.error('Failed to update profile picture. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const [contributionScore, setContributionScore] = useState(0);
  const postCount = posts?.length || 0;
  const solvedCount = useMemo(() => (posts || []).filter(p => (p.status || '').toLowerCase() === 'solved').length, [posts]);
  const resolutionPercent = useMemo(() => {
    if (!postCount) return 0;
    return Math.min(100, Math.max(0, Math.round((solvedCount / postCount) * 100)));
  }, [postCount, solvedCount]);
  const tier = useMemo(() => {
    const p = resolutionPercent;
    if (p >= 90) return { name: 'Platinum', color: 'bg-indigo-600', text: 'text-indigo-50' };
    if (p >= 70) return { name: 'Gold', color: 'bg-yellow-500', text: 'text-yellow-50' };
    if (p >= 40) return { name: 'Silver', color: 'bg-gray-400', text: 'text-white' };
    return { name: 'Bronze', color: 'bg-amber-700', text: 'text-amber-50' };
  }, [resolutionPercent]);
  // Set contribution score to be the same as post count (1:1 ratio)
  useEffect(() => {
    setContributionScore(postCount);
  }, [postCount]);
  const followers = userDoc?.followers?.length || 0;
  const following = userDoc?.following?.length || 0;

  // Calculate contribution score when user data loads
  useEffect(() => {
    const fetchScore = async () => {
      if (userDoc?.uid) {
        const score = await calculateContributionScore(userDoc.uid);
        setContributionScore(score);
      }
    };
    fetchScore();
  }, [userDoc?.uid]);

  // Normalize date helper
  const toDate = (t) => {
    try { return t?.toDate ? t.toDate() : new Date(t); } catch { return new Date(NaN); }
  };

  // Posts filter/sort
  const filteredSortedPosts = useMemo(() => {
    let list = [...(posts || [])];
    // Filter
    if (postFilter !== 'all') {
      list = list.filter(p => (p.status || '').toLowerCase() === postFilter.toLowerCase());
    }
    // Sort
    list.sort((a, b) => {
      if (postSort === 'newest') return toDate(b.timestamp) - toDate(a.timestamp);
      if (postSort === 'oldest') return toDate(a.timestamp) - toDate(b.timestamp);
      if (postSort === 'status') return (a.status || '').localeCompare(b.status || '');
      if (postSort === 'media') return (b.mediaPath ? 1 : 0) - (a.mediaPath ? 1 : 0);
      return 0;
    });
    return list;
  }, [posts, postFilter, postSort]);

  // Weekly streak and XP
  const { weeklyCount, currentStreakDays, xpPoints } = useMemo(() => {
    const now = new Date();
    const start7 = new Date(now);
    start7.setDate(now.getDate() - 6);
    // Count per day
    const daySet = new Set();
    let weekly = 0;
    (posts || []).forEach(p => {
      const d = toDate(p.timestamp);
      if (!isNaN(d)) {
        const key = d.toISOString().slice(0,10);
        daySet.add(key);
        if (d >= start7 && d <= now) weekly += 1;
      }
    });
    // Current streak (consecutive days up to today)
    let streak = 0;
    for (let i = 0; i < 30; i++) { // look back 30 days
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0,10);
      if (daySet.has(key)) streak += 1; else break;
    }
    // XP points: 10 per solved, 2 per post
    const xp = solvedCount * 10 + postCount * 2;
    return { weeklyCount: weekly, currentStreakDays: streak, xpPoints: xp };
  }, [posts, solvedCount, postCount]);

  return (
    <div className="min-h-screen bg-white">
      <SpinnerModal visible={loading} label="Loading profile..." />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24">
        {/* Header */}
        <section className="flex items-start gap-6">
          <Avatar url={profileForm.avatarUrl || userDoc?.avatarUrl} name={userDoc?.name} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900 truncate">{userDoc?.name || "User"}</h1>
              {isMine ? (
                <>
                  <button onClick={() => setEditMode((v) => !v)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-emerald-600 hover:text-emerald-700">
                    {editMode ? "Cancel" : "Edit Profile"}
                  </button>
                </>
              ) : (
                <button onClick={handleFollowToggle} className={`rounded-md px-3 py-1.5 text-sm font-medium border ${isFollowing ? "border-gray-300 text-gray-700" : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"}`}>
                  {isFollowing ? "Following" : "Follow"}
                </button>
              )}
              {isMine && (
                <>
                  <button onClick={handlePickAvatar} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-emerald-600 hover:text-emerald-700">Change Avatar</button>
                  <button onClick={handleSignOut} className="rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm font-medium hover:border-red-500 hover:text-red-700">Sign Out</button>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4 max-w-md">
              <Stat label="Posts" value={postCount} />
              <Stat label="Followers" value={followers} />
              <Stat label="Following" value={following} />
            </div>
            
            {/* Activity Section */}
            <div className="mt-6 p-4 bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-100 shadow-sm">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-sm font-medium text-emerald-800">Your Activity</h3>
                  <p className="text-xs text-emerald-600 mt-0.5">Your posts and contributions</p>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">Total Posts</div>
                  <div className="text-2xl font-bold text-emerald-700">{postCount}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">Posts Solved</div>
                  <div className={`text-2xl font-bold ${solvedCount > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>{solvedCount}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">Resolution Rate</div>
                  <div className="text-2xl font-bold text-emerald-700">{resolutionPercent}%</div>
                </div>
              </div>
              {/* Streak + XP */}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">Weekly Posts</div>
                  <div className="text-xl font-bold text-emerald-700">{weeklyCount}</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">Current Streak</div>
                  <div className="text-xl font-bold text-emerald-700">{currentStreakDays}d</div>
                </div>
                <div className="p-3 bg-white rounded-lg border border-emerald-100 text-center">
                  <div className="text-xs text-gray-600">XP</div>
                  <div className="text-xl font-bold text-emerald-700">{xpPoints}</div>
                </div>
              </div>
              {/* Visual gauge + tier badge */}
              <div className="mt-4 flex items-center justify-center gap-4">
                <div className="shrink-0">
                  <ResolutionGauge percent={resolutionPercent} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Performance Tier</div>
                  <div className={`inline-flex items-center gap-2 px-2.5 py-1 mt-1 rounded-full text-xs font-semibold ${tier.color} ${tier.text}`}>
                    {tier.name}
                  </div>
                  {/* Progress bar for mobile or quick glance */}
                  <div className="mt-3 w-56 max-w-full">
                    <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-500"
                        style={{ width: `${resolutionPercent}%` }}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={resolutionPercent}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">Resolution progress</div>
                  </div>
                </div>
              </div>
              {/* Achievements */}
              <div className="mt-4 text-center">
                <div className="text-sm font-medium text-gray-900 mb-2">Achievements</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${solvedCount >= 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    Bronze Solver • 1+
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${solvedCount >= 5 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    Active Solver • 5+
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${solvedCount >= 10 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    Impact Solver • 10+
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${solvedCount >= 25 ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    Community Hero • 25+
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-emerald-700 text-center">
                {postCount > 0
                  ? `Great work! ${solvedCount} of your ${postCount} posts are marked as solved.`
                  : 'Start by making your first post!'}
              </p>
            </div>
            
            <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">
              {editMode ? (
                <textarea
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  rows={3}
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Write a short bio"
                />
              ) : (
                userDoc?.bio || ""
              )}
            </div>
            {editMode && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Display name"
                />
                <button onClick={handleSaveProfile} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Save</button>
              </div>
            )}
          </div>
        </section>

        {/* Grid of posts with filters */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-600">Filter:</span>
              {['all','solved','inProgress','pending','rejected'].map(f => (
                <button
                  key={f}
                  onClick={() => setPostFilter(f)}
                  className={`px-2.5 py-1 rounded-full border text-xs ${postFilter === f ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {f === 'all' ? 'All' : f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm ml-auto">
              <span className="text-gray-600">Sort:</span>
              {[
                { k: 'newest', label: 'Newest' },
                { k: 'oldest', label: 'Oldest' },
                { k: 'status', label: 'Status' },
                { k: 'media', label: 'Has Media' },
              ].map(s => (
                <button
                  key={s.k}
                  onClick={() => setPostSort(s.k)}
                  className={`px-2.5 py-1 rounded-full border text-xs ${postSort === s.k ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {filteredSortedPosts.map((p) => {
              const isVideo = (p.mediaType || "").startsWith("video");
              if (isVideo) {
                return (
                  <div key={p.id} className="relative aspect-square bg-gray-100">
                    <video src={p.mediaPath} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
                  </div>
                );
              }
              return (
                <div key={p.id} className="relative aspect-square bg-gray-100">
                  {p.mediaPath ? (
                    <img src={p.mediaPath} alt="post" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-xs text-gray-500 p-2 text-center">{p.reason || "Complaint"}</div>
                  )}
                  {p.status && (
                    <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 border border-gray-200">
                      {p.status}
                    </div>
                  )}
                  {(p.status || '').toLowerCase() !== 'solved' && (
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-2">
                      {/* Due date badge */}
                      <div className={`text-[10px] px-1.5 py-0.5 rounded-full border ${isOverdue(p) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        Due: {formatShort(getDueDate(p))}
                      </div>
                      {/* Escalate */}
                      <button
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/80 border border-gray-200 hover:bg-gray-50"
                        onClick={() => handleEscalate(p)}
                      >
                        Escalate
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {posts.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-600">No posts yet.</div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Profile;
