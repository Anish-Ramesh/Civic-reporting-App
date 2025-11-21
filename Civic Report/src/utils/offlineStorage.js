// Utility for handling offline data storage and sync
import { db } from './Firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { createComplaint } from './FirebaseFunctions';

const DB_NAME = 'civicReportDB';
const STORE_NAME = 'pendingComplaints';
let dbPromise;

// Initialize IndexedDB
const initDB = () => {
  if (!window.indexedDB) {
    console.warn("IndexedDB is not supported in this browser");
    return Promise.reject("IndexedDB not supported");
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = (event) => {
      console.error("Error opening IndexedDB:", event);
      reject("Error opening database");
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });

  return dbPromise;
};

// Save complaint to IndexedDB when offline
export const saveOfflineComplaint = async (complaintData) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Generate a temporary ID for the offline complaint
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add metadata for the offline complaint
    const offlineComplaint = {
      ...complaintData,
      id: tempId,
      isOffline: true,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Store the complaint
    await store.add(offlineComplaint);
    
    // Trigger storage event to notify other tabs
    window.dispatchEvent(new Event('offlineComplaintAdded'));
    
    return tempId;
  } catch (error) {
    console.error('Error saving offline complaint:', error);
    throw new Error('Failed to save complaint offline. Please try again.');
  }
};

// Get all pending offline complaints
export const getPendingComplaints = async () => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(Array.isArray(request.result) ? request.result : []);
      };
      request.onerror = (error) => {
        console.error('Error in getPendingComplaints:', error);
        resolve([]);
      };
    });
  } catch (error) {
    console.error('Error getting pending complaints:', error);
    return [];
  }
};

// Remove a synced complaint from IndexedDB
const removeSyncedComplaint = async (id) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.delete(id);
  } catch (error) {
    console.error('Error removing synced complaint:', error);
  }
};

// Sync pending complaints when back online
export const syncPendingComplaints = async () => {
  if (!navigator.onLine) return { success: false, message: 'Device is offline' };

  try {
    const complaints = await getPendingComplaints();
    const failedComplaints = [];
    
    if (!Array.isArray(complaints) || complaints.length === 0) {
      console.log('No pending complaints to sync');
      return { success: true, syncedCount: 0 };
    }
    
    for (const complaint of complaints) {
      try {
        // Remove the offline-specific fields before sending to server
        const { id, isOffline, ...cleanComplaint } = complaint;
        
        // Use the createComplaint function from FirebaseFunctions
        await createComplaint(cleanComplaint);
        
        // Remove from IndexedDB after successful sync
        await removeSyncedComplaint(id);
        // Notify listeners that a complaint has been synced
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('offlineComplaintSynced'));
        }
      } catch (error) {
        console.error(`Error syncing complaint ${complaint.id}:`, error);
        failedComplaints.push({
          id: complaint.id,
          error: error.message
        });
        // Continue with other complaints even if one fails
      }
    }
    
    if (failedComplaints.length > 0) {
      console.warn('Some complaints failed to sync:', failedComplaints);
      if (typeof toast !== 'undefined') {
        toast.error(`${failedComplaints.length} complaints failed to sync. They will be retried later.`);
      }
    }
    return { 
      success: failedComplaints.length === 0,
      syncedCount: complaints.length - failedComplaints.length,
      total: complaints.length,
      errors: failedComplaints
    };
  } catch (error) {
    console.error('Error during sync:', error);
    return {
      success: false,
      message: error.message || 'Failed to sync complaints',
      error
    };
  }
};

// Check online status and sync if needed
export const checkOnlineStatus = async () => {
  try {
    if (!navigator.onLine) {
      return { success: false, message: 'Device is offline' };
    }
    
    const result = await syncPendingComplaints();
    
    if (result.success) {
      console.log(`Successfully synced ${result.syncedCount} complaints`);
      if (result.syncedCount > 0 && typeof toast !== 'undefined') {
        toast.success(`Successfully synced ${result.syncedCount} offline complaint${result.syncedCount > 1 ? 's' : ''}`);
      }
    } else if (result.errors && result.errors.length > 0 && typeof toast !== 'undefined') {
      console.warn(`Some complaints failed to sync:`, result.errors);
      toast.warning(`Synced ${result.syncedCount} of ${result.total} complaints. Some failed to sync.`);
    }
    
    return result;
  } catch (error) {
    console.error('Error in checkOnlineStatus:', error);
    toast.error('Failed to sync offline complaints');
    return {
      success: false,
      message: error.message || 'Failed to sync offline complaints',
      error
    };
  }
};

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', checkOnlineStatus);
  window.addEventListener('offline', () => {
    // You could show a toast notification here if desired
    console.log('App is offline. Changes will be saved locally.');
  });
}
