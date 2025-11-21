import React, { createContext, useContext, useState, useCallback } from 'react';

// Shapes:
// pendingVideo: { blob: Blob, mime: string, previewUrl: string } | null
// pendingPhotos: Array<{ blob: Blob, mime: string, previewUrl: string }>
const MediaCaptureContext = createContext(null);

export const MediaCaptureProvider = ({ children }) => {
  const [pendingVideo, setPendingVideo] = useState(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);

  const setVideo = useCallback((blob, mime) => {
    // Clear existing
    if (!blob) {
      if (pendingVideo?.previewUrl) URL.revokeObjectURL(pendingVideo.previewUrl);
      setPendingVideo(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPendingVideo({ blob, mime: mime || blob.type, previewUrl: url });
  }, [pendingVideo]);

  const addPhoto = useCallback((blob, mime) => {
    const url = URL.createObjectURL(blob);
    setPendingPhotos(prev => [...prev, { blob, mime: mime || blob.type, previewUrl: url }]);
  }, []);

  const clearAll = useCallback(() => {
    if (pendingVideo?.previewUrl) URL.revokeObjectURL(pendingVideo.previewUrl);
    pendingPhotos.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPendingVideo(null);
    setPendingPhotos([]);
  }, [pendingVideo, pendingPhotos]);

  return (
    <MediaCaptureContext.Provider value={{ pendingVideo, pendingPhotos, setVideo, addPhoto, clearAll }}>
      {children}
    </MediaCaptureContext.Provider>
  );
};

export const useMediaCapture = () => {
  const ctx = useContext(MediaCaptureContext);
  if (!ctx) throw new Error('useMediaCapture must be used within MediaCaptureProvider');
  return ctx;
};
