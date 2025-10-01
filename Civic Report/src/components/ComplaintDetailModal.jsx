import React, { useState, useEffect } from 'react';
import { X, MapPin, Clock, Send as SendIcon, CheckCircle, XCircle, Maximize2, ShieldCheck, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { auth, db } from '../utils/Firebase';
import { addComment, isOfficial as checkIfOfficial } from '../utils/FirebaseFunctions';
import { doc, updateDoc } from 'firebase/firestore';
import { statusColors } from '../utils/enums';
import { toast } from 'react-toastify';

// Status badge component
const StatusBadge = ({ status, className = '' }) => {
  const statusColor = statusColors[status] || statusColors.PENDING;
  
  return (
    <Badge 
      className={`px-3 py-1 rounded-full text-sm font-medium ${className}`}
      style={{ 
        backgroundColor: `${statusColor}15`,
        color: statusColor,
        border: `1px solid ${statusColor}40`
      }}
    >
      {status}
    </Badge>
  );
};

// Action button component ( fixed)
const ActionButton = ({ 
  onClick, 
  icon: Icon, 
  label, 
  variant = 'default',
  className = '',
  disabled = false
}) => {
  const variants = {
    default: 'bg-primary-600 hover:bg-primary-700 text-white',
    outline: 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white'
  };

  return (
    <Button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${variants[variant]} ${className}`}
      disabled={disabled}
    >
      {Icon && <Icon className="w-4 h-4" />} 
      {label}
    </Button>
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

const ComplaintDetailModal = ({ open, onClose, complaint, onStatusUpdate }) => {
  const [isOfficial, setIsOfficial] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(complaint.status || 'pending');
  const [isImageOpen, setIsImageOpen] = useState(false);
  
  const timestamp = new Date(complaint.timestamp);
  const formattedDate = timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const formattedTime = timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const officialStatus = await checkIfOfficial(user.uid);
        setIsOfficial(officialStatus);
      }
    });
    
    return () => unsubscribe();
  }, []);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addComment(complaint.id, {
        text: comment,
        timestamp: new Date().toISOString(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
      });
      setComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      setIsSubmitting(true);
      // Call the parent's status update handler
      await onStatusUpdate(complaint.id, newStatus);
      setStatus(newStatus);
      toast.success(`Status updated to ${newStatus.replace('_', ' ').toLowerCase()}`);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(`Failed to update status: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-neutral-100 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Complaint Details</h2>
            <div className="flex items-center mt-1">
              <StatusBadge status={status} className="text-sm" />
              {complaint.onChain?.enabled && (
                <a 
                  href={`https://${explorerBaseFor(complaint.onChain.chainId)}/tx/${complaint.onChain.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 transition-colors"
                >
                  <ShieldCheck className="w-3 h-3 mr-1.5" />
                  Certified on Blockchain
                  <ExternalLink className="w-2.5 h-2.5 ml-1.5 opacity-70" />
                </a>
              )}
              <span className="text-sm text-neutral-500 ml-2">
                Reported on {formattedDate} at {formattedTime}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Close dialog"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
      
        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* Complaint Details */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-neutral-900 mb-2">Issue</h3>
              <p className="text-neutral-700">{complaint.reason}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-500">Location</p>
                  <p className="text-neutral-900">
                    {typeof complaint.location === 'string' 
                      ? complaint.location 
                      : complaint.location?.name || 'Not specified'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-500">Reported</p>
                  <p className="text-neutral-900">{formattedDate} • {formattedTime}</p>
                </div>
              </div>
            </div>
            
            {complaint.description && (
              <div>
                <h4 className="text-sm font-medium text-neutral-500 mb-1">Description</h4>
                <p className="text-neutral-700 whitespace-pre-line">{complaint.description}</p>
              </div>
            )}
            
            {/* Audio Player */}
            {complaint.audioUrl && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-neutral-500 mb-2">Voice Note</h4>
                <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg">
                  <audio 
                    src={complaint.audioUrl} 
                    controls 
                    className="h-8 w-full"
                    controlsList="nodownload"
                  />
                </div>
              </div>
            )}
            
            {/* Complaint Image */}
            {complaint.mediaUrl && (
              <div>
                <h4 className="text-sm font-medium text-neutral-500 mb-2">Attached Image</h4>
                <div 
                  className="relative group cursor-pointer rounded-lg overflow-hidden border border-neutral-200 w-full max-w-md"
                  onClick={() => setIsImageOpen(true)}
                >
                  <img 
                    src={complaint.mediaUrl} 
                    alt="Complaint evidence" 
                    className="w-full h-auto object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                    <div className="bg-white bg-opacity-80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Maximize2 className="w-4 h-4 text-neutral-700" />
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-xs text-neutral-500">Click to view full size</p>
              </div>
            )}
          </div>
          
          {/* Comments Section */}
          <div className="border-t border-neutral-100 pt-6">
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Comments</h3>
            
            {/* Comment List */}
            <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-2">
              {complaint.comments?.length > 0 ? (
                complaint.comments.map((comment, index) => (
                  <div key={index} className="flex space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {comment.userName?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="bg-neutral-50 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-neutral-900">
                            {comment.userName || 'Anonymous'}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {new Date(comment.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-neutral-700">{comment.text}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-500 text-center py-4">No comments yet</p>
              )}
            </div>
            
            {/* Add Comment */}
            <form onSubmit={handleCommentSubmit} className="mt-4">
              <div className="flex space-x-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 min-h-[80px] resize-none"
                  disabled={isSubmitting}
                />
                <Button 
                  type="submit" 
                  className="self-end"
                  disabled={!comment.trim() || isSubmitting}
                >
                  <SendIcon className="w-4 h-4 mr-1" />
                  Send
                </Button>
              </div>
            </form>
          </div>
          
          {/* Action Buttons */}
          {complaint.onChain?.enabled && (
            <div className="border-t border-neutral-100 pt-4 flex flex-wrap gap-3 justify-end">
              <a
                href={`https://${explorerBaseFor(complaint.onChain.chainId)}/tx/${complaint.onChain.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View on Blockchain
              </a>
            </div>
          )}
          {isOfficial && (
            <div className="border-t border-neutral-100 pt-4 flex flex-wrap gap-3 justify-end">
              {status === 'pending' && (
                <>
                  <ActionButton
                    onClick={() => handleStatusUpdate('inProgress')}
                    icon={Clock}
                    label="Mark as In Progress"
                    variant="default"
                    disabled={isSubmitting}
                  />
                  <ActionButton
                    onClick={() => handleStatusUpdate('solved')}
                    icon={CheckCircle}
                    label="Mark as Solved"
                    variant="success"
                    disabled={isSubmitting}
                  />
                  <ActionButton
                    onClick={() => handleStatusUpdate('rejected')}
                    icon={XCircle}
                    label="Mark as Rejected"
                    variant="danger"
                    disabled={isSubmitting}
                  />
                </>
              )}
              {status === 'inProgress' && (
                <>
                  <ActionButton
                    onClick={() => handleStatusUpdate('solved')}
                    icon={CheckCircle}
                    label="Mark as Solved"
                    variant="success"
                    disabled={isSubmitting}
                  />
                  <ActionButton
                    onClick={() => handleStatusUpdate('rejected')}
                    icon={XCircle}
                    label="Mark as Rejected"
                    variant="danger"
                    disabled={isSubmitting}
                  />
                </>
              )}
              {status === 'solved' && (
                <ActionButton
                  onClick={() => handleStatusUpdate('inProgress')}
                  icon={Clock}
                  label="Reopen as In Progress"
                  variant="outline"
                  disabled={isSubmitting}
                />
              )}
              {status === 'rejected' && (
                <ActionButton
                  onClick={() => handleStatusUpdate('inProgress')}
                  icon={Clock}
                  label="Reopen as In Progress"
                  variant="outline"
                  disabled={isSubmitting}
                />
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Image Viewer Modal */}
      {isImageOpen && complaint.mediaUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" 
          onClick={() => setIsImageOpen(false)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIsImageOpen(false)}
              className="absolute -top-10 right-0 p-2 text-white hover:bg-white/10 rounded-full transition-colors z-10"
              aria-label="Close image viewer"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex items-center justify-center h-full">
              <img 
                src={complaint.mediaUrl} 
                alt="Complaint evidence" 
                className="max-h-[80vh] max-w-full object-contain"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-sm p-2 text-center">
              <p>Click outside to close</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintDetailModal;

