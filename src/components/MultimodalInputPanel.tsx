import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Camera, 
  Edit3, 
  Type, 
  Square, 
  Circle, 
  Minus, 
  RotateCcw, 
  Download,
  Upload,
  Play,
  Pause,
  Trash2,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  X,
  Plus
} from 'lucide-react';
import type { 
  MultimodalInput, 
  TextInput, 
  VoiceInput, 
  SketchInput, 
  PhotoInput,
  SketchStroke,
  InputPanelState
} from '../types/architectural';

interface MultimodalInputPanelProps {
  onSubmit: (input: MultimodalInput) => void;
  onInputChange?: (input: Partial<MultimodalInput>) => void;
  isProcessing?: boolean;
  className?: string;
}

const MultimodalInputPanel: React.FC<MultimodalInputPanelProps> = ({
  onSubmit,
  onInputChange,
  isProcessing = false,
  className = ''
}) => {
  const [state, setState] = useState<InputPanelState>({
    activeTab: 'text',
    isRecording: false,
    isDrawing: false,
    isCameraActive: false,
    inputs: {}
  });

  // Multiple inputs arrays
  const [textInputs, setTextInputs] = useState<TextInput[]>([]);
  const [voiceInputs, setVoiceInputs] = useState<VoiceInput[]>([]);
  const [sketchInputs, setSketchInputs] = useState<SketchInput[]>([]);
  const [photoInputs, setPhotoInputs] = useState<PhotoInput[]>([]);
  const [videoInputs, setVideoInputs] = useState<any[]>([]);
  
  // Editing states
  const [editingText, setEditingText] = useState<number | null>(null);
  const [editingTextContent, setEditingTextContent] = useState('');

  // Text input state
  const [textContent, setTextContent] = useState('');
  
  // Voice input state
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sketch input state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser' | 'line' | 'rectangle' | 'circle'>('pen');
  const [brushSize, setBrushSize] = useState(3);
  const [brushColor, setBrushColor] = useState('#000000');
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Camera input state
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isPausedVideo, setIsPausedVideo] = useState(false);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [recordingDurationVideo, setRecordingDurationVideo] = useState(0);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateInputs = useCallback((newInputs: Partial<MultimodalInput>) => {
    setState(prev => ({
      ...prev,
      inputs: { ...prev.inputs, ...newInputs }
    }));
    onInputChange?.(newInputs);
  }, [onInputChange]);

  // Text Input Handlers
  const handleTextSubmit = useCallback(() => {
    if (!textContent.trim()) return;
    
    const textInput: TextInput = {
      type: 'text',
      content: textContent.trim(),
      timestamp: new Date()
    };
    
    setTextInputs(prev => [...prev, textInput]);
    setTextContent('');
    updateInputs({ text: textInputs.concat(textInput) });
  }, [textContent, textInputs, updateInputs]);

  const handleTextEdit = useCallback((index: number) => {
    setEditingText(index);
    setEditingTextContent(textInputs[index].content);
  }, [textInputs]);

  const handleTextSave = useCallback((index: number) => {
    if (!editingTextContent.trim()) return;
    
    const updatedInputs = [...textInputs];
    updatedInputs[index] = {
      ...updatedInputs[index],
      content: editingTextContent.trim()
    };
    
    setTextInputs(updatedInputs);
    setEditingText(null);
    setEditingTextContent('');
    updateInputs({ text: updatedInputs });
  }, [editingTextContent, textInputs, updateInputs]);

  const handleTextDelete = useCallback((index: number) => {
    const updatedInputs = textInputs.filter((_, i) => i !== index);
    setTextInputs(updatedInputs);
    updateInputs({ text: updatedInputs.length > 0 ? updatedInputs : undefined });
  }, [textInputs, updateInputs]);

  // Voice Input Handlers
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      // Start speech recognition if available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setState(prev => ({ ...prev, isRecording: true }));
      
      // Start timer
      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      recognitionRef.current?.stop();
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setState(prev => ({ ...prev, isRecording: false }));
    }
  }, [state.isRecording]);

  const submitVoiceInput = useCallback(() => {
    if (!audioBlob) return;

    const voiceInput: VoiceInput = {
      type: 'voice',
      audioBlob,
      transcript,
      duration: recordingDuration,
      timestamp: new Date()
    };

    setVoiceInputs(prev => [...prev, voiceInput]);
    setAudioBlob(null);
    setTranscript('');
    setRecordingDuration(0);
    updateInputs({ voice: voiceInputs.concat(voiceInput) });
  }, [audioBlob, transcript, recordingDuration, voiceInputs, updateInputs]);

  const handleVoiceDelete = useCallback((index: number) => {
    const updatedInputs = voiceInputs.filter((_, i) => i !== index);
    setVoiceInputs(updatedInputs);
    updateInputs({ voice: updatedInputs.length > 0 ? updatedInputs : undefined });
  }, [voiceInputs, updateInputs]);

  // Sketch Input Handlers
  const getCanvasCoordinates = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    
    if ('touches' in event) {
      // Touch event
      const touch = event.touches[0] || event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    return { x, y };
  }, []);

  const saveCanvasState = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const imageData = canvas.toDataURL();
      setCanvasHistory(prev => {
        const newHistory = [...prev, imageData];
        // Limit history to last 50 states to prevent memory issues
        return newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
      });
    }
  }, []);

  const startDrawing = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault(); // Prevent scrolling on touch
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCanvasCoordinates(event);
    
    setIsDrawing(true);
    setLastPoint({ x, y });
  }, [getCanvasCoordinates]);

  const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault(); // Prevent scrolling on touch
    if (!isDrawing || !canvasRef.current || !lastPoint) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(event);

    ctx.strokeStyle = currentTool === 'eraser' ? '#FFFFFF' : brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPoint({ x, y });
  }, [isDrawing, lastPoint, currentTool, brushSize, brushColor, getCanvasCoordinates]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setLastPoint(null);

    // Save canvas state AFTER completing the stroke
    saveCanvasState();

    // Save the stroke for tracking purposes
    const canvas = canvasRef.current;
    if (canvas) {
      const newStroke: SketchStroke = {
        points: [], // In practice, you'd collect all points during drawing
        color: brushColor,
        width: brushSize,
        tool: currentTool
      };
      setStrokes(prev => [...prev, newStroke]);
    }
  }, [isDrawing, brushColor, brushSize, currentTool, saveCanvasState]);

  const undoLastAction = useCallback(() => {
    if (canvasHistory.length <= 1) {
      return; // Keep at least the initial state
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get the state to restore to (second to last)
    const stateToRestore = canvasHistory[canvasHistory.length - 2];
    const newHistory = canvasHistory.slice(0, -1);
    
    setCanvasHistory(newHistory);
    
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.onerror = () => {
      // Fallback: just clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    img.src = stateToRestore;
    
    // Remove last stroke from strokes array
    setStrokes(prev => prev.slice(0, -1));
  }, [canvasHistory]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Save current state before clearing
    saveCanvasState();

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setStrokes([]);
    setCanvasHistory([]); // Reset history after clear
    
    // Save the cleared state as new initial state
    setTimeout(() => {
      if (canvas) {
        const clearedState = canvas.toDataURL();
        setCanvasHistory([clearedState]);
      }
    }, 100);
  }, [saveCanvasState]);

  const submitSketch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const imageData = canvas.toDataURL();
    const sketchInput: SketchInput = {
      type: 'sketch',
      imageData,
      strokes,
      dimensions: {
        width: canvas.width,
        height: canvas.height
      },
      timestamp: new Date()
    };

    setSketchInputs(prev => [...prev, sketchInput]);
    // Clear the canvas after submitting
    clearCanvas();
    updateInputs({ sketch: sketchInputs.concat(sketchInput) });
  }, [strokes, sketchInputs, updateInputs]);

  const handleSketchDelete = useCallback((index: number) => {
    const updatedInputs = sketchInputs.filter((_, i) => i !== index);
    setSketchInputs(updatedInputs);
    updateInputs({ sketch: updatedInputs.length > 0 ? updatedInputs : undefined });
  }, [sketchInputs, updateInputs]);

  // Camera Input Handlers
  const startCamera = useCallback(async () => {
    console.log('🎥 Starting camera...');
    try {
      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }

      console.log('🎥 Requesting camera permissions...');
      
      // Try different camera configurations with audio
      let stream: MediaStream | null = null;
      const configurations = [
        { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
        { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
        { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true },
        { video: true, audio: true },
        // Fallback without audio if audio permission denied
        { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } },
        { video: true }
      ];

      for (const config of configurations) {
        try {
          console.log('🎥 Trying config:', config);
          stream = await navigator.mediaDevices.getUserMedia(config);
          console.log('🎥 Success with config:', config);
          break;
        } catch (err) {
          console.log('🎥 Config failed:', config, err);
        }
      }

      if (!stream) {
        throw new Error('Could not access camera with any configuration');
      }
      
      console.log('🎥 Camera stream obtained:', stream);
      console.log('🎥 Stream tracks:', stream.getTracks());
      console.log('🎥 Video tracks:', stream.getVideoTracks().length);
      console.log('🎥 Audio tracks:', stream.getAudioTracks().length);
      
      // Log track details
      stream.getVideoTracks().forEach((track, index) => {
        console.log(`🎥 Video track ${index + 1}:`, track.label, track.enabled);
      });
      stream.getAudioTracks().forEach((track, index) => {
        console.log(`🔊 Audio track ${index + 1}:`, track.label, track.enabled);
      });
      
      // Update both stream and state together to prevent timing issues
      setCameraStream(stream);
      setState(prev => {
        console.log('🎥 Setting camera active state...');
        const newState = { ...prev, isCameraActive: true };
        console.log('🎥 New state will be:', newState);
        return newState;
      });
      
    } catch (error) {
      console.error('🎥 Error accessing camera:', error);
      setState(prev => ({ ...prev, isCameraActive: false }));
      
      let errorMessage = 'Could not access camera. ';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please grant camera permissions and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage += 'Camera not supported in this browser.';
        } else {
          errorMessage += error.message;
        }
      }
      alert(errorMessage);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    console.log('📸 Attempting to capture photo...');
    const video = videoRef.current;
    
    if (!video) {
      console.error('📸 Video element not found');
      alert('Video element not found. Please restart camera.');
      return;
    }
    
    if (!cameraStream) {
      console.error('📸 Camera stream not available');
      alert('Camera stream not available. Please restart camera.');
      return;
    }

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      console.error('📸 Video not ready for capture');
      alert('Video not ready. Please wait a moment and try again.');
      return;
    }

    console.log('📸 Video dimensions:', video.videoWidth, 'x', video.videoHeight);
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        console.log('📸 Photo captured successfully');
        console.log('📸 Image data length:', imageData.length);
        setCapturedPhoto(imageData);
      } catch (error) {
        console.error('📸 Error capturing photo:', error);
        alert('Error capturing photo. Please try again.');
      }
    } else {
      console.error('📸 Could not get canvas context');
      alert('Error creating image. Please try again.');
    }
  }, [cameraStream]);

  const submitPhoto = useCallback(() => {
    if (!capturedPhoto) return;

    const photoInput: PhotoInput = {
      type: 'photo',
      imageData: capturedPhoto,
      metadata: {
        width: videoRef.current?.videoWidth || 0,
        height: videoRef.current?.videoHeight || 0,
        device: navigator.userAgent
      },
      timestamp: new Date()
    };

    setPhotoInputs(prev => [...prev, photoInput]);
    setCapturedPhoto(null);
    updateInputs({ photo: photoInputs.concat(photoInput) });
  }, [capturedPhoto, photoInputs, updateInputs]);

  const handlePhotoDelete = useCallback((index: number) => {
    const updatedInputs = photoInputs.filter((_, i) => i !== index);
    setPhotoInputs(updatedInputs);
    updateInputs({ photo: updatedInputs.length > 0 ? updatedInputs : undefined });
  }, [photoInputs, updateInputs]);

  const handleVideoSubmit = useCallback((videoBlob: Blob) => {
    const videoInput = {
      type: 'video',
      videoBlob,
      duration: 0,
      timestamp: new Date()
    };

    setVideoInputs(prev => [...prev, videoInput]);
    setRecordedVideoBlob(null);
    updateInputs({ video: videoInputs.concat(videoInput) });
  }, [videoInputs, updateInputs]);

  const handleVideoDelete = useCallback((index: number) => {
    const updatedInputs = videoInputs.filter((_, i) => i !== index);
    setVideoInputs(updatedInputs);
    updateInputs({ video: updatedInputs.length > 0 ? updatedInputs : undefined });
  }, [videoInputs, updateInputs]);

  const startVideoRecording = useCallback(() => {
    if (!cameraStream) return;
    
    try {
      const mediaRecorder = new MediaRecorder(cameraStream);
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        setRecordedVideoBlob(blob);
        // Create preview URL for playback
        const url = URL.createObjectURL(blob);
        setVideoPreviewUrl(url);
        console.log('🎬 Video recording complete');
        
        // Stop timer
        if (videoTimerRef.current) {
          clearInterval(videoTimerRef.current);
          videoTimerRef.current = null;
        }
      };
      
      videoRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecordingVideo(true);
      setIsPausedVideo(false);
      
      // Start timer
      const startTime = Date.now();
      videoTimerRef.current = setInterval(() => {
        setRecordingDurationVideo(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      console.log('🎬 Started video recording');
    } catch (error) {
      console.error('🎬 Error starting video recording:', error);
    }
  }, [cameraStream]);

  const pauseVideoRecording = useCallback(() => {
    if (videoRecorderRef.current && isRecordingVideo && !isPausedVideo) {
      videoRecorderRef.current.pause();
      setIsPausedVideo(true);
      
      // Pause timer
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current);
        videoTimerRef.current = null;
      }
      
      console.log('🎬 Paused video recording');
    }
  }, [isRecordingVideo, isPausedVideo]);

  const resumeVideoRecording = useCallback(() => {
    if (videoRecorderRef.current && isRecordingVideo && isPausedVideo) {
      videoRecorderRef.current.resume();
      setIsPausedVideo(false);
      
      // Resume timer from current duration
      const startTime = Date.now() - (recordingDurationVideo * 1000);
      videoTimerRef.current = setInterval(() => {
        setRecordingDurationVideo(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      console.log('🎬 Resumed video recording');
    }
  }, [isRecordingVideo, isPausedVideo, recordingDurationVideo]);

  const stopVideoRecording = useCallback(() => {
    if (videoRecorderRef.current && isRecordingVideo) {
      videoRecorderRef.current.stop();
      setIsRecordingVideo(false);
      setIsPausedVideo(false);
      console.log('🎬 Stopped video recording');
    }
  }, [isRecordingVideo]);

  const discardVideo = useCallback(() => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setRecordedVideoBlob(null);
    setVideoPreviewUrl(null);
    setRecordingDurationVideo(0);
    console.log('🎬 Discarded video recording');
  }, [videoPreviewUrl]);

  const muteCamera = useCallback(() => {
    if (cameraStream) {
      const audioTracks = cameraStream.getAudioTracks();
      console.log(`🔇 Found ${audioTracks.length} audio tracks`);
      
      if (audioTracks.length === 0) {
        console.warn('🔇 No audio tracks found in camera stream');
        return;
      }
      
      // Only mute audio tracks, keep video tracks active
      audioTracks.forEach((track, index) => {
        track.enabled = !track.enabled;
        console.log(`🔇 Audio track ${index + 1} ${track.enabled ? 'unmuted' : 'muted'}`);
      });
    } else {
      console.warn('🔇 No camera stream available for muting');
    }
  }, [cameraStream]);

  const stopCamera = useCallback(() => {
    console.log('🎥 stopCamera called - current state:', { isRecordingVideo, hasCameraStream: !!cameraStream, isCameraActive: state.isCameraActive });
    
    if (isRecordingVideo) {
      console.log('🎥 Stopping video recording...');
      stopVideoRecording();
    }
    
    // Use ref to get the most current stream
    const currentStream = cameraStreamRef.current || cameraStream;
    if (currentStream) {
      console.log('🎥 Stopping camera stream tracks...');
      currentStream.getTracks().forEach(track => {
        console.log(`🎥 Stopping track: ${track.kind} - ${track.label} (readyState: ${track.readyState})`);
        track.stop();
      });
      setCameraStream(null);
      cameraStreamRef.current = null;
    } else {
      console.log('🎥 No camera stream to stop');
    }
    
    setState(prev => ({ ...prev, isCameraActive: false }));
    setCapturedPhoto(null);
    discardVideo();
    console.log('🎥 Camera stop complete');
    setRecordingDurationVideo(0);
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  }, [cameraStream, isRecordingVideo, stopVideoRecording, discardVideo]);

  // Submit all inputs
  const handleSubmit = useCallback(() => {
    const hasInputs = Object.keys(state.inputs).length > 0;
    if (!hasInputs) return;

    const multimodalInput: MultimodalInput = {
      ...state.inputs,
      combined: Object.keys(state.inputs).length > 1
    };

    onSubmit(multimodalInput);
  }, [state.inputs, onSubmit]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || state.activeTab !== 'sketch') return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Set canvas background to white
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Save initial state after a short delay to ensure canvas is ready
      setTimeout(() => {
        if (canvas) {
          const initialState = canvas.toDataURL();
          setCanvasHistory([initialState]);
          setStrokes([]); // Reset strokes when switching to sketch tab
        }
      }, 100);
    }
  }, [state.activeTab]);

  // Set up video stream when camera becomes active
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      console.log('🎥 Setting up video stream directly...');
      videoRef.current.srcObject = cameraStream;
      
      videoRef.current.onloadedmetadata = () => {
        console.log('🎥 Video metadata loaded, starting playback...');
        if (videoRef.current) {
          videoRef.current.play()
            .then(() => {
              console.log('🎥 Video playing successfully');
            })
            .catch(err => {
              console.error('🎥 Error playing video:', err);
            });
        }
      };

      videoRef.current.onerror = (error) => {
        console.log('🎥 Video element error during cleanup - expected behavior:', error);
        // Clear the srcObject to prevent further errors
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    }
  }, [cameraStream]); // Only depend on cameraStream, not state

  // Auto-stop camera when navigating away from camera tab
  useEffect(() => {
    console.log('🎥 Camera cleanup effect triggered - activeTab:', state.activeTab, 'cameraStream exists:', !!cameraStream);
    if (state.activeTab !== 'camera' && cameraStream) {
      console.log('🎥 Leaving camera tab, stopping camera...');
      stopCamera();
    }
  }, [state.activeTab, cameraStream, stopCamera]);

  // Cleanup on unmount - ensure camera is always stopped
  useEffect(() => {
    return () => {
      console.log('🧹 MultimodalInputPanel unmounting - cleaning up camera and resources');
      
      // Stop video recording if active
      if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
        console.log('🎥 Stopping video recording...');
        videoRecorderRef.current.stop();
      }
      
      // Stop all camera tracks using ref to get latest stream
      if (cameraStreamRef.current) {
        console.log('🎥 Stopping camera stream...');
        cameraStreamRef.current.getTracks().forEach(track => {
          console.log(`🎥 Stopping track: ${track.kind} - ${track.label}`);
          track.stop();
        });
      }
      
      // Clear any running timers
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current);
      }
      
      // Revoke any object URLs
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      
      // Also check video element and clear its source
      if (videoRef.current) {
        console.log('🎥 Clearing video element source...');
        videoRef.current.srcObject = null;
      }
      if (previewVideoRef.current) {
        console.log('🎥 Clearing preview video element source...');
        previewVideoRef.current.srcObject = null;
      }
    };
  }, []); // Empty dependency array - only runs on unmount

  return (
    <div className={`cosmic-panel rounded-2xl p-8 ${className}`}>
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white mb-2">Describe Your Product</h3>
        <p className="text-gray-400 text-sm">
          Use text, voice, sketch, or camera to explain your idea
        </p>
      </div>

      {/* Simplified Tab Navigation */}
      <div className="flex space-x-1 mb-6 horizon-card rounded-lg p-1">
        {[
          { id: 'text', icon: <Type className="w-4 h-4" /> },
          { id: 'voice', icon: <Mic className="w-4 h-4" /> },
          { id: 'sketch', icon: <Edit3 className="w-4 h-4" /> },
          { id: 'camera', icon: <Camera className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setState(prev => ({ ...prev, activeTab: tab.id as any }))}
            className={`flex items-center justify-center p-3 rounded-md transition-all ${
              state.activeTab === tab.id
                ? 'bg-cyan-500 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title={tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {/* Text Input */}
        {state.activeTab === 'text' && (
          <div className="space-y-4">
            {/* Existing Text Inputs */}
            {textInputs.map((input, index) => (
              <div key={index} className="p-3 horizon-card rounded-lg">
                {editingText === index ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingTextContent}
                      onChange={(e) => setEditingTextContent(e.target.value)}
                      className="w-full h-20 p-2 horizon-input resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTextSave(index)}
                        className="flex-1 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                      >
                        <Save className="w-3 h-3 inline mr-1" />
                        Save
                      </button>
                      <button
                        onClick={() => setEditingText(null)}
                        className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-300 text-sm mb-2">{input.content}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTextEdit(index)}
                        className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30"
                      >
                        <Edit className="w-3 h-3 inline mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleTextDelete(index)}
                        className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30"
                      >
                        <Trash2 className="w-3 h-3 inline mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* New Text Input */}
            <div className="space-y-2">
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Add another text description..."
                className="w-full h-24 p-3 horizon-input resize-none"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textContent.trim()}
                className="w-full py-2 bg-cyan-500 text-white rounded-lg disabled:opacity-50 hover:bg-cyan-600 transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Text
              </button>
            </div>
          </div>
        )}

        {/* Voice Input */}
        {state.activeTab === 'voice' && (
          <div className="space-y-4">
            {/* Existing Voice Inputs */}
            {voiceInputs.map((input, index) => (
              <div key={index} className="p-3 horizon-card rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Mic className="w-3 h-3 text-cyan-400" />
                      <span className="text-xs text-gray-400">
                        {input.duration}s recording
                      </span>
                    </div>
                    {input.transcript && (
                      <p className="text-gray-300 text-sm">{input.transcript}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleVoiceDelete(index)}
                    className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* New Voice Recording */}
            <div className="text-center">
              <button
                onClick={state.isRecording ? stopRecording : startRecording}
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-all ${
                  state.isRecording 
                    ? 'bg-red-500 animate-pulse hover:bg-red-600' 
                    : 'bg-cyan-500 hover:bg-cyan-600'
                }`}
              >
                {state.isRecording ? (
                  <MicOff className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-white" />
                )}
              </button>
              
              {state.isRecording && (
                <div className="text-red-400 text-sm mt-2">
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>

            {transcript && (
              <div className="p-3 horizon-card rounded-lg">
                <p className="text-gray-300 text-sm">{transcript}</p>
              </div>
            )}

            {audioBlob && !state.isRecording && (
              <button
                onClick={submitVoiceInput}
                className="w-full py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Voice
              </button>
            )}
          </div>
        )}

        {/* Sketch Input */}
        {state.activeTab === 'sketch' && (
          <div className="space-y-4">
            {/* Existing Sketches */}
            {sketchInputs.map((input, index) => (
              <div key={index} className="p-3 horizon-card rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    Sketch {index + 1}
                  </span>
                  <button
                    onClick={() => handleSketchDelete(index)}
                    className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <img
                  src={input.imageData}
                  alt={`Sketch ${index + 1}`}
                  className="w-full h-24 object-contain bg-white rounded border border-white/30"
                />
              </div>
            ))}

            {/* New Sketch */}
            <div className="space-y-3">
              {/* Simplified Tools */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentTool('pen')}
                    className={`p-2 rounded-lg ${currentTool === 'pen' ? 'bg-cyan-500 text-white' : 'bg-black/20 text-gray-400'}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-8 h-8 rounded border border-white/30"
                  />
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-16 accent-cyan-500"
                  />
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={undoLastAction}
                    disabled={canvasHistory.length <= 1}
                    className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={clearCanvas}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Canvas */}
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full border border-white/30 rounded-lg bg-white cursor-crosshair touch-none"
              />

              <button
                onClick={submitSketch}
                disabled={strokes.length === 0}
                className="w-full py-2 bg-cyan-500 text-white rounded-lg disabled:opacity-50 hover:bg-cyan-600 transition-colors"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Sketch
              </button>
            </div>
          </div>
        )}

        {/* Camera Input */}
        {state.activeTab === 'camera' && (
          <div className="space-y-4 horizon-card rounded-lg p-4">
            {/* Existing Photos */}
            {photoInputs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm text-gray-400">Photos ({photoInputs.length})</h4>
                <div className="grid grid-cols-2 gap-2">
                  {photoInputs.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={photo.imageData}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-20 object-cover rounded border border-white/30"
                      />
                      <button
                        onClick={() => handlePhotoDelete(index)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing Videos */}
            {videoInputs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm text-gray-400">Videos ({videoInputs.length})</h4>
                <div className="space-y-2">
                  {videoInputs.map((video, index) => (
                    <div key={index} className="flex items-center justify-between p-2 horizon-card rounded">
                      <div className="flex items-center gap-2">
                        <Play className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-gray-300">Video {index + 1}</span>
                      </div>
                      <button
                        onClick={() => handleVideoDelete(index)}
                        className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs hover:bg-red-500/30"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Camera Interface - Full Screen */}
            <div className="relative -mx-4 -my-6" style={{ height: 'calc(100vh - 90px)' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full bg-black block object-cover"
              />
              {/* Recording Status Overlay */}
              {isRecordingVideo && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500/40 backdrop-blur-sm text-white px-3 py-2 rounded-lg border border-red-400/30">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">
                    REC {Math.floor(recordingDurationVideo / 60)}:{(recordingDurationVideo % 60).toString().padStart(2, '0')}
                    {isPausedVideo && <span className="ml-2 text-yellow-300">PAUSED</span>}
                  </span>
                </div>
              )}
            </div>

            {!cameraStream ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={startCamera}
                  className="px-8 py-4 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors shadow-lg backdrop-blur-sm border border-white/20"
                >
                  <Camera className="w-6 h-6 inline mr-2" />
                  Start Camera
                </button>
              </div>
            ) : capturedPhoto ? (
              <div className="space-y-3">
                <img
                  src={capturedPhoto}
                  alt="Captured"
                  className="w-full rounded-lg border border-purple-400/30"
                  style={{ height: '150px', objectFit: 'contain' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={submitPhoto}
                    className="flex-1 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    Add Photo
                  </button>
                  <button
                    onClick={() => setCapturedPhoto(null)}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    Retake
                  </button>
                </div>
              </div>
            ) : videoPreviewUrl ? (
              <div className="space-y-3 bg-black/5 backdrop-blur-sm rounded-lg p-3 border border-purple-400/10">
                <div className="relative">
                  <video
                    ref={previewVideoRef}
                    src={videoPreviewUrl}
                    controls
                    className="w-full rounded-lg border border-purple-400/30 bg-black"
                    style={{ height: '300px', objectFit: 'contain' }}
                  />
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    Duration: {Math.floor(recordingDurationVideo / 60)}:{(recordingDurationVideo % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVideoSubmit(recordedVideoBlob!)}
                    className="flex-1 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    Add Video
                  </button>
                  <button
                    onClick={discardVideo}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    <Trash2 className="w-4 h-4 inline mr-1" />
                    Redo
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Floating translucent controls overlay */}
                <div className="absolute bottom-4 left-4 right-4 bg-black/20 backdrop-blur-md rounded-lg p-3 border border-white/20 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={capturePhoto}
                      disabled={isRecordingVideo}
                      className="py-3 bg-cyan-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-cyan-600/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Camera className="w-5 h-5 inline mr-2" />
                      Photo
                    </button>
                    
                    <button
                      onClick={isRecordingVideo ? stopVideoRecording : startVideoRecording}
                      className={`py-3 text-white rounded-lg transition-colors backdrop-blur-sm ${
                        isRecordingVideo 
                          ? 'bg-red-500/80 hover:bg-red-600/80' 
                          : 'bg-green-500/80 hover:bg-green-600/80'
                      }`}
                    >
                      {isRecordingVideo ? (
                        <>
                          <Pause className="w-5 h-5 inline mr-2" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5 inline mr-2" />
                          Record
                        </>
                      )}
                    </button>
                  </div>

                  {/* Recording Controls - Only show while recording */}
                  {isRecordingVideo && (
                    <div className="flex gap-2">
                      <button
                        onClick={isPausedVideo ? resumeVideoRecording : pauseVideoRecording}
                        className={`flex-1 py-2 text-white rounded-lg transition-colors backdrop-blur-sm ${
                          isPausedVideo 
                            ? 'bg-yellow-500/80 hover:bg-yellow-600/80' 
                            : 'bg-orange-500/80 hover:bg-orange-600/80'
                        }`}
                      >
                        {isPausedVideo ? (
                          <>
                            <Play className="w-4 h-4 inline mr-1" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-4 h-4 inline mr-1" />
                            Pause
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  
                  {/* Camera Controls */}
                  <div className="flex gap-2">
                    {/* TODO: Uncomment when audio mute functionality is needed
                    <button
                      onClick={muteCamera}
                      className="flex-1 py-2 bg-purple-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-purple-600/80"
                      title="Mute/Unmute Audio"
                    >
                      <MicOff className="w-4 h-4 inline mr-1" />
                      Mute
                    </button>
                    */}

                    <button
                      onClick={stopCamera}
                      className="w-full py-2 bg-gray-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-gray-600/80"
                    >
                      <X className="w-4 h-4 inline mr-1" />
                      Stop Camera
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit Section */}
      {Object.keys(state.inputs).length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/30">
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full py-3 horizon-button-primary text-white font-medium rounded-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 transition-all"
          >
            {isProcessing ? 'Generating...' : 'Generate 3D Model'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MultimodalInputPanel; 