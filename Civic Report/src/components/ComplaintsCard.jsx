import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog } from '@mui/material';
import { Statuses, statusColors } from '../utils/enums';
import ComplaintDetailModal from './ComplaintDetailModal';
import { ShieldCheck, ExternalLink } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const statusColor = statusColors[status] || statusColors.PENDING;
  
  return (
    <span 
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ 
        backgroundColor: `${statusColor}15`,
        color: statusColor,
        border: `1px solid ${statusColor}40`
      }}
    >
      {status}
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

const ComplaintsCard = ({ complaint }) => {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setHovered] = useState(false);
  const date = new Date(complaint.timestamp);
  const statusKey = Object.keys(Statuses).find(key => Statuses[key] === complaint.status);
  
  const formattedDate = date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden transition-all duration-200 hover:shadow-md"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 line-clamp-2 mb-1">
                  {complaint.reason}
                </h3>
                <p className="text-sm text-neutral-500">
                  {typeof complaint.location === 'string' 
                    ? complaint.location 
                    : complaint.location?.name || 'Location not specified'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={complaint.status} />
                {complaint.onChain?.enabled && (
                  <a 
                    href={`https://${explorerBaseFor(complaint.onChain.chainId)}/tx/${complaint.onChain.txHash}`}
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
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
              <div className="flex items-center text-sm text-neutral-500">
                <svg 
                  className="w-4 h-4 mr-1.5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
                  />
                </svg>
                <span>{formattedDate}</span>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDialogOpen(true)}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors flex items-center"
              >
                View Details
                <svg 
                  className="w-4 h-4 ml-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </motion.button>
            </div>
          </div>
          
          <motion.div 
            className="h-1 bg-gradient-to-r from-primary-500 to-primary-300"
            initial={{ width: '0%' }}
            animate={{ width: isHovered ? '100%' : '0%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          />
        </motion.div>
      </AnimatePresence>

      <Dialog
        open={isDialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <ComplaintDetailModal
          setDialogOpen={setDialogOpen}
          complaint={complaint}
        />
      </Dialog>
    </>
  );
};

export default ComplaintsCard;
