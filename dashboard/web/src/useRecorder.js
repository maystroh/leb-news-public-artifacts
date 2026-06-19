import {useCallback, useEffect, useRef, useState} from 'react';

// Self-contained mic recorder so SceneRow stays readable. Owns the getUserMedia
// stream, the MediaRecorder, chunk assembly, an elapsed timer, and cleanup.
// Interface: {state, elapsedMs, error, mimeType, start(), stop(), reset(), blob, url}
// states: 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'
export function useRecorder() {
  const [state, setState] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState(null);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const mimeRef = useRef('audio/webm');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Revoke the object URL when it changes or on unmount to avoid leaking blobs.
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => () => stopStream(), [stopStream]);

  const reset = useCallback(() => {
    stopStream();
    recorderRef.current = null;
    chunksRef.current = [];
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBlob(null);
    setElapsedMs(0);
    setError(null);
    setState('idle');
  }, [stopStream]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is not supported in this browser.');
      setState('error');
      return;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      mimeRef.current = mime || 'audio/webm';
      const recorder = mime ? new MediaRecorder(stream, {mimeType: mime}) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeRef.current;
        const recorded = new Blob(chunksRef.current, {type});
        stopStream();
        setBlob(recorded);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(recorded);
        });
        setState('recorded');
      };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
      recorder.start();
      setState('recording');
    } catch (err) {
      stopStream();
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission denied.' : err.message || 'Could not start recording.');
      setState('error');
    }
  }, [stopStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  return {state, elapsedMs, error, mimeType: mimeRef.current, start, stop, reset, blob, url};
}
