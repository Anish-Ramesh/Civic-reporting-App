import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

const VoiceRecorder = ({ onRecordingComplete, onClearRecording }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const timerRef = useRef(null);
  const audioChunks = useRef([]);

  const startRecording = async () => {
    try {
      // Clean up any existing recording
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      // Reset state
      setAudioBlob(null);
      setAudioUrl('');
      setRecordingTime(0);
      audioChunks.current = [];

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        .catch(err => {
          console.error('Microphone access denied:', err);
          throw new Error('Microphone access was denied. Please allow microphone access to record audio.');
        });
      
      // Create MediaRecorder
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstart = () => {
        console.log('Recording started');
        startTimer();
      };

      recorder.onstop = () => {
        console.log('Recording stopped');
        stopTimer();
        
        try {
          const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
          console.log('Audio blob created, size:', audioBlob.size);
          
          if (audioBlob.size === 0) {
            throw new Error('Recording produced no audio data');
          }
          
          const url = URL.createObjectURL(audioBlob);
          console.log('Audio URL created');
          
          setAudioBlob(audioBlob);
          setAudioUrl(url);
          onRecordingComplete?.(audioBlob);
        } catch (error) {
          console.error('Error creating audio blob:', error);
          alert('Failed to process recording. Please try again.');
        } finally {
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        }
      };

      // Start recording with 100ms timeslice
      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error in startRecording:', error);
      alert(error.message || 'Could not start recording. Please try again.');
      throw error;
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      console.log('Stopping recording...');
      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.requestData(); // Request any remaining data
          mediaRecorder.stop();
        }
        setIsRecording(false);
      } catch (error) {
        console.error('Error stopping recording:', error);
        mediaRecorder.stream?.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        stopTimer();
      }
    }
  };

  const togglePauseResume = () => {
    if (!mediaRecorder) return;

    if (isPaused) {
      mediaRecorder.resume();
      startTimer();
    } else {
      mediaRecorder.pause();
      stopTimer();
    }
    setIsPaused(!isPaused);
  };

  const clearRecording = () => {
    // Stop any ongoing recording
    if (mediaRecorder) {
      try {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      } catch (e) {
        console.warn('Error stopping media recorder:', e);
      }
    }
    
    // Clean up blob URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    // Reset state
    setAudioBlob(null);
    setAudioUrl('');
    setRecordingTime(0);
    audioChunks.current = [];
    onClearRecording?.();
  };

  const startTimer = () => {
    stopTimer();
    const startTime = Date.now() - (recordingTime * 1000);
    
    // Update immediately to avoid delay
    const updateTime = () => {
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      setRecordingTime(elapsedTime);
    };
    
    // Initial update
    updateTime();
    
    // Then update every second
    timerRef.current = setInterval(updateTime, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch (e) {
          console.warn('Error stopping media recorder:', e);
        }
      }
      // Revoke any existing object URLs
      if (audioUrl) {
        try {
          URL.revokeObjectURL(audioUrl);
        } catch (e) {
          console.warn('Error revoking object URL:', e);
        }
      }
    };
  }, [mediaRecorder, audioUrl]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [audioUrl]);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white shadow-sm">
      {/* Controls */}
      <div className="flex items-center justify-between">
        {!isRecording && !audioUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            className="gap-2"
          >
            <Mic className="h-4 w-4" />
            Record Voice Note
          </Button>
        )}

        {isRecording && (
          <div className="flex items-center space-x-2">
            <span className="flex items-center text-sm text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-600 mr-2 animate-pulse"></span>
              Recording... {formatTime(recordingTime)}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
              className="gap-2"
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Audio Player */}
      {audioUrl && audioBlob && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center space-x-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center bg-gray-50 rounded-lg p-2">
                <audio 
                  src={audioUrl} 
                  controls 
                  className="h-8 w-full"
                  controlsList="nodownload"
                  onError={(e) => {
                    console.error('Error playing audio:', e);
                    // Try to recover by creating a new blob URL
                    if (audioBlob) {
                      try {
                        const newUrl = URL.createObjectURL(audioBlob);
                        e.target.src = newUrl;
                        // Clean up the old URL
                        URL.revokeObjectURL(audioUrl);
                        setAudioUrl(newUrl);
                      } catch (err) {
                        console.error('Error recovering audio URL:', err);
                      }
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                {formatFileSize(audioBlob.size)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearRecording}
              className="text-red-500 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
              title="Delete recording"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Status Message */}
      {!isRecording && !audioUrl && (
        <p className="text-xs text-gray-500 text-center">
          Click the record button to record a voice note (max 5 minutes)
        </p>
      )}
    </div>
  );
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper function to format time (mm:ss)
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default VoiceRecorder;
