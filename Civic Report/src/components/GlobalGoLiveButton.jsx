import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaCapture } from '../contexts/MediaCaptureContext.jsx';

const GlobalGoLiveButton = () => {
  const navigate = useNavigate();
  const { setVideo, addPhoto, pendingPhotos } = useMediaCapture();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [stream, setStream] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const chunksRef = useRef([]);
  const videoRef = useRef(null);

  // Allow other parts of the app to open this modal programmatically
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('openGoLive', handler);
    return () => window.removeEventListener('openGoLive', handler);
  }, []);

  useEffect(() => {
    if (open && !stream) {
      // Pre-warm permissions
      (async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        } catch (e) {
          console.warn('Camera/mic permission denied:', e);
        }
      })();
    }
    if (!open && stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  }, [open]);

  const startRecording = async () => {
    if (!stream) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (e) {
        alert('Unable to access camera/microphone.');
        return;
      }
    }
    const rec = new MediaRecorder(stream || videoRef.current?.srcObject, { mimeType: 'video/webm;codecs=vp8,opus' });
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setVideo(blob, 'video/webm');
      setOpen(false);
      setRecording(false);
      // Navigate to report to continue submission
      navigate('/report');
    };
    rec.start();
    setRecorder(rec);
    setRecording(true);
  };

  const stopRecording = () => {
    if (recorder && recording) {
      recorder.stop();
    }
  };

  const takeSnapshot = async () => {
    try {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      const canvas = document.createElement('canvas');
      const w = videoEl.videoWidth || 1280;
      const h = videoEl.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, w, h);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (blob) addPhoto(blob, 'image/jpeg');
    } catch (e) {
      console.warn('Snapshot failed:', e);
    }
  };

  const close = () => {
    if (recording) {
      stopRecording();
    }
    setOpen(false);
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 rounded-full bg-red-600 text-white shadow-lg px-4 py-3 font-semibold hover:bg-red-700 active:scale-95"
        aria-label="Go Live"
      >
        Go Live
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div className="relative z-10 bg-white rounded-xl w-[92vw] max-w-md p-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Go Live - Record Video</h3>
            <div className="aspect-video bg-black rounded overflow-hidden">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              {!recording ? (
                <button onClick={startRecording} className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700">Start</button>
              ) : (
                <>
                  <button onClick={takeSnapshot} className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Take Photo</button>
                  <button onClick={stopRecording} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">Stop & Use</button>
                </>
              )}
              <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">Close</button>
            </div>
            <div className="mt-2 text-xs text-gray-600">Photos captured: {pendingPhotos?.length || 0}</div>
            <p className="mt-2 text-xs text-gray-500">After stopping, you'll be redirected to the Report page with the recorded video attached. You can add other details before submitting.</p>
          </div>
        </div>
      )}
    </>
  );
};

export default GlobalGoLiveButton;
