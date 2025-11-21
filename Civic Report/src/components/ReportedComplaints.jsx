import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/Firebase";
import { fetchComplaintsByUser } from "../utils/FirebaseFunctions.jsx";
import ComplaintsCard from "./ComplaintsCard";

const statusWeight = {
  "In-Progress": 1,
  REJECTED: 2,
  SOLVED: 3,
};

const ReportedComplaints = () => {
  const [complaints, setComplaints] = useState([]);
  const [sortBy, setSortBy] = useState("timestamp"); // timestamp | status | location
  const [sortOrder, setSortOrder] = useState("desc"); // asc | desc
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate("/citizen-login");
        return;
      }
      const unsubscribe = fetchComplaintsByUser(user.uid, handleComplaintsUpdate);
      return () => unsubscribe();
    });
    return () => unsub && unsub();
  }, []);

  const handleComplaintsUpdate = (updatedComplaints) => {
    console.log('Updated complaints:', updatedComplaints);
    console.log('Number of complaints:', updatedComplaints.length);
    setComplaints(updatedComplaints);
  };

  const sortedComplaints = useMemo(() => {
    const arr = [...complaints];
    arr.sort((a, b) => {
      let av;
      let bv;
      switch (sortBy) {
        case "status":
          av = statusWeight[a.status] || 0;
          bv = statusWeight[b.status] || 0;
          break;
        case "location":
          av = (a.location?.name || "").toLowerCase();
          bv = (b.location?.name || "").toLowerCase();
          break;
        case "timestamp":
        default:
          av = a.timestamp || 0;
          bv = b.timestamp || 0;
          break;
      }
      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [complaints, sortBy, sortOrder]);

  console.log('Rendering with complaints:', complaints);
  
  return (
    <div className="lg:border lg:shadow-[3px_4px_4px_rgba(0,0,0,0.26)] rounded-lg lg:border-solid lg:border-black w-full flex flex-col items-center lg:h-[28rem] py-2">
      <div className="w-full flex flex-col lg:flex-row items-center justify-between px-4 gap-3">
        <h3 className="font-bold my-2">Complaints Reported by You</h3>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-700">Sort by</label>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="timestamp">Date</option>
            <option value="status">Status</option>
            <option value="location">Location</option>
          </select>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      <div className="container px-4 overflow-y-auto w-full">
        {sortedComplaints.length === 0 ? (
          <h2>No Complaints Found</h2>
        ) : (
          sortedComplaints.map((complaint) => (
            <ComplaintsCard key={complaint.id} complaint={complaint} />
          ))
        )}
      </div>
    </div>
  );
};

export default ReportedComplaints;
