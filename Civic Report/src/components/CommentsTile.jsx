import React, { useState, useEffect } from "react";
import { User } from "lucide-react";
import { fetchUserById } from "../utils/FirebaseFunctions.jsx";

const CommentsTile = ({ comment }) => {
  const [commentAuthor, setCommentAuthor] = useState(null);
  
  useEffect(() => {
    const fetchAuthor = async () => {
      const user = await fetchUserById(comment.author);
      setCommentAuthor(user);
    };
    
    fetchAuthor();
  }, [comment.author]);

  if (!commentAuthor) {
    return <div>Loading...</div>;
  }

  const timestamp = new Date(comment.timestamp);
  const date = timestamp.toLocaleDateString();
  const time = timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
  
  return (
    <div className="mb-4">
      <div className="flex justify-between w-full">
        <div className="h-10 w-10 flex justify-center items-center bg-primary-500 rounded-full">
          <User className="w-5 h-5 text-white" />
        </div>
        <div className="font-semibold flex px-4 items-center w-full justify-between">
          <p>{commentAuthor?.name || 'Anonymous'}</p>
          <p className="text-sm text-gray-500">{date} • {time}</p>
        </div>
      </div>
      <p className="ml-14 mt-1 text-gray-700">{comment.comment}</p>
    </div>
  );
};

export default CommentsTile;
