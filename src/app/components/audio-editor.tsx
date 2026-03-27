import React, { useRef, useState, useEffect } from "react";
import {
  Upload,
  Play,
  Pause,
  Scissors,
  Download,
  X,
  Music,
  Volume2,
  VolumeX,
  RotateCcw,
  Replace,
  Check,
} from "lucide-react";

interface AudioEditorProps {
  videoUrl: string;
  videoBlob: Blob;
  mimeType: string;
  inverted: boolean;
  canvasW: number;
  canvasH: number;
  initialAudioFile?: File | null;
  initialAudioBuffer?: AudioBuffer | null;
  initialVolume?: number;
  onDownloadVideoOnly?: () => void;
}

export function AudioEditor({
  videoUrl,
  videoBlob,
  mimeType,
  inverted,
  canvasW,
  canvasH,
  initialAudioFile,
  initialAudioBuffer,
  initialVolume,
  onDownloadVideoOnly,
}: AudioEditorProps) {
  const [audioFile, setAudioFile] = useState<File | null>(
    initialAudioFile || null,
  );
  const [audioBuffer, setAudioBuffer] =
    useState<AudioBuffer | null>(initialAudioBuffer || null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [audioDuration, setAudioDuration] = useState(
    initialAudioBuffer?.duration || 0,
  );

  // Trim & offset
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(
    initialAudioBuffer?.duration || 0,
  );
  const [audioOffset, setAudioOffset] = useState(0);

  // Preview
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [audioVolume, setAudioVolume] = useState(
    initialVolume ?? 0.7,
  );
  const [isMuted, setIsMuted] = useState(false);

  // Merging
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState("");

  // Drag state for trim handles
  const [dragging, setDragging] = useState<
    "start" | "end" | "region" | null
  >(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartVal, setDragStartVal] = useState(0);
  const [dragStartVal2, setDragStartVal2] = useState(0);

  // Audio editing expanded
  const [showAudioTools, setShowAudioTools] = useState(
    !!(initialAudioFile && initialAudioBuffer),
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(
    null,
  );
  const gainNodeRef = useRef<GainNode | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRAFRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAudioInputRef = useRef<HTMLInputElement>(null);

  // Theme classes
  const panelCls = inverted
    ? "bg-neutral-900/80 backdrop-blur-sm border border-neutral-800"
    : "bg-white border border-neutral-200 shadow-sm";
  const textCls = inverted ? "text-white" : "text-neutral-900";
  const labelCls = inverted
    ? "text-neutral-300"
    : "text-neutral-600";
  const mutedCls = inverted
    ? "text-neutral-500"
    : "text-neutral-400";
  const sliderTrack = inverted
    ? "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-indigo-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
    : "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-neutral-200 accent-indigo-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg";

  // Get video duration
  useEffect(() => {
    if (!videoBlob) return;
    const tempUrl = URL.createObjectURL(videoBlob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e10;
        v.onseeked = () => {
          setVideoDuration(v.currentTime);
          v.currentTime = 0;
          v.onseeked = null;
          URL.revokeObjectURL(tempUrl);
        };
      } else {
        setVideoDuration(v.duration);
        URL.revokeObjectURL(tempUrl);
      }
    };
    v.onerror = () => URL.revokeObjectURL(tempUrl);
    v.src = tempUrl;
  }, [videoBlob]);

  // Sync initial audio props
  useEffect(() => {
    if (initialAudioFile && initialAudioBuffer) {
      setAudioFile(initialAudioFile);
      setAudioBuffer(initialAudioBuffer);
      setAudioDuration(initialAudioBuffer.duration);
      setTrimStart(0);
      setTrimEnd(initialAudioBuffer.duration);
      setAudioOffset(0);
      setShowAudioTools(true);
      if (initialVolume !== undefined)
        setAudioVolume(initialVolume);
    }
  }, [initialAudioFile, initialAudioBuffer]);

  const loadAudioFile = async (file: File) => {
    setAudioFile(file);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      ctx.close();
      setAudioBuffer(decoded);
      setAudioDuration(decoded.duration);
      setTrimStart(0);
      setTrimEnd(decoded.duration);
      setAudioOffset(0);
      setShowAudioTools(true);
    } catch {
      setAudioFile(null);
      setAudioBuffer(null);
    }
  };

  const handleAudioUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadAudioFile(file);
  };

  const removeAudio = () => {
    stopPreview();
    setAudioFile(null);
    setAudioBuffer(null);
    setAudioDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setAudioOffset(0);
    setShowAudioTools(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addAudioInputRef.current)
      addAudioInputRef.current.value = "";
  };

  // Draw waveform - now with video duration context
  useEffect(() => {
    if (
      !audioBuffer ||
      !waveformCanvasRef.current ||
      videoDuration <= 0
    )
      return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = inverted ? "#1a1a1a" : "#f5f5f5";
    ctx.fillRect(0, 0, width, height);

    // The waveform is scaled to video duration so audio position maps directly to the timeline
    // The full width represents the video duration
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Draw the trimmed audio region positioned by offset on the video timeline
    const trimmedDuration = trimEnd - trimStart;
    const audioStartInVideo = audioOffset; // where audio starts on the video timeline
    const audioEndInVideo = audioOffset + trimmedDuration;

    // Map pixel to video time
    const pxToVideoTime = (px: number) =>
      (px / width) * videoDuration;
    const videoTimeToPx = (t: number) =>
      (t / videoDuration) * width;

    // Draw dimmed full audio waveform mapped to its position on video timeline
    // First, draw the trimmed audio region background
    const regionStartPx = Math.max(
      0,
      videoTimeToPx(audioStartInVideo),
    );
    const regionEndPx = Math.min(
      width,
      videoTimeToPx(audioEndInVideo),
    );

    // Draw a subtle background for the audio region
    ctx.fillStyle = inverted
      ? "rgba(147, 51, 234, 0.08)"
      : "rgba(147, 51, 234, 0.06)";
    ctx.fillRect(
      regionStartPx,
      0,
      regionEndPx - regionStartPx,
      height,
    );

    // Draw the waveform within the audio region
    const amp = height / 2;
    for (
      let px = Math.floor(regionStartPx);
      px < Math.ceil(regionEndPx) && px < width;
      px++
    ) {
      // Map this pixel to a position in the audio buffer
      const videoTime = pxToVideoTime(px);
      const audioTime =
        trimStart + (videoTime - audioStartInVideo);
      if (audioTime < trimStart || audioTime > trimEnd)
        continue;

      const sampleIndex = Math.floor(audioTime * sampleRate);
      const samplesPerPx = Math.ceil(
        (trimmedDuration / (regionEndPx - regionStartPx)) *
          sampleRate,
      );

      let min = 1.0,
        max = -1.0;
      for (
        let j = 0;
        j < samplesPerPx && sampleIndex + j < data.length;
        j++
      ) {
        const datum = data[sampleIndex + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const y1 = (1 + min) * amp;
      const y2 = (1 + max) * amp;

      // Highlighted trimmed region
      ctx.fillStyle = inverted
        ? "rgba(147, 51, 234, 0.6)"
        : "rgba(147, 51, 234, 0.5)";
      ctx.fillRect(px, y1, 1, y2 - y1 || 1);
    }

    // Draw region boundaries
    ctx.fillStyle = "#9333ea";
    if (regionStartPx >= 0 && regionStartPx < width) {
      ctx.fillRect(regionStartPx - 1, 0, 2, height);
    }
    if (regionEndPx >= 0 && regionEndPx <= width) {
      ctx.fillRect(regionEndPx - 1, 0, 2, height);
    }

    // Draw grip dots on handles
    for (const px of [regionStartPx, regionEndPx]) {
      if (px >= 0 && px <= width) {
        ctx.fillStyle = "#fff";
        for (let g = -4; g <= 4; g += 4) {
          ctx.fillRect(px - 0.5, height / 2 + g - 1, 2, 2);
        }
      }
    }

    // If audio extends beyond video, show an indicator
    if (audioEndInVideo > videoDuration) {
      const overflowStartPx = videoTimeToPx(videoDuration);
      ctx.fillStyle = inverted
        ? "rgba(239, 68, 68, 0.15)"
        : "rgba(239, 68, 68, 0.1)";
      ctx.fillRect(
        overflowStartPx,
        0,
        width - overflowStartPx,
        height,
      );

      // Dashed line at video end
      ctx.strokeStyle = inverted
        ? "rgba(239, 68, 68, 0.5)"
        : "rgba(239, 68, 68, 0.4)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(overflowStartPx, 0);
      ctx.lineTo(overflowStartPx, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Preview playback cursor
    if (isPreviewing && previewTime > 0) {
      const cursorPx = videoTimeToPx(previewTime);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(cursorPx - 0.5, 0, 2, height);
    }
  }, [
    audioBuffer,
    trimStart,
    trimEnd,
    audioDuration,
    audioOffset,
    videoDuration,
    inverted,
    isPreviewing,
    previewTime,
  ]);

  // Waveform mouse interaction - now based on video timeline
  const handleWaveformMouseDown = (e: React.MouseEvent) => {
    if (
      !audioBuffer ||
      !waveformCanvasRef.current ||
      videoDuration <= 0
    )
      return;
    const rect =
      waveformCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const trimmedDuration = trimEnd - trimStart;
    const regionStartPx = (audioOffset / videoDuration) * width;
    const regionEndPx =
      ((audioOffset + trimmedDuration) / videoDuration) * width;

    if (Math.abs(x - regionStartPx) < 12) {
      setDragging("start");
      setDragStartX(e.clientX);
      setDragStartVal(audioOffset);
      setDragStartVal2(trimStart);
    } else if (Math.abs(x - regionEndPx) < 12) {
      setDragging("end");
      setDragStartX(e.clientX);
      setDragStartVal(trimEnd);
    } else if (x > regionStartPx && x < regionEndPx) {
      setDragging("region");
      setDragStartX(e.clientX);
      setDragStartVal(audioOffset);
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!waveformCanvasRef.current || videoDuration <= 0)
        return;
      const rect =
        waveformCanvasRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStartX;
      const dt = (dx / rect.width) * videoDuration;

      if (dragging === "start") {
        // Dragging start handle adjusts both offset and trimStart
        const newOffset = Math.max(0, dragStartVal + dt);
        const trimDelta = newOffset - dragStartVal;
        const newTrimStart = Math.max(
          0,
          Math.min(trimEnd - 0.1, dragStartVal2 + trimDelta),
        );
        setAudioOffset(newOffset);
        setTrimStart(newTrimStart);
      } else if (dragging === "end") {
        // Dragging end handle adjusts trimEnd
        const newTrimEnd = Math.max(
          trimStart + 0.1,
          Math.min(audioDuration, dragStartVal + dt),
        );
        setTrimEnd(newTrimEnd);
      } else if (dragging === "region") {
        // Dragging region moves offset
        const newOffset = Math.max(0, dragStartVal + dt);
        setAudioOffset(newOffset);
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    dragging,
    dragStartX,
    dragStartVal,
    dragStartVal2,
    audioDuration,
    trimStart,
    trimEnd,
    videoDuration,
  ]);

  // Preview - stop audio when video ends
  const startPreview = () => {
    if (!audioBuffer || !videoRef.current) return;
    const video = videoRef.current;
    const ctx = audioContextRef.current || new AudioContext();
    audioContextRef.current = ctx;
    try {
      audioSourceRef.current?.stop();
    } catch {}

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const gain = ctx.createGain();
    gain.gain.value = isMuted ? 0 : audioVolume;
    const fadeStart = Math.max(0, videoDuration - 2);
    gain.gain.setValueAtTime(
      isMuted ? 0 : audioVolume,
      ctx.currentTime,
    );
    gain.gain.linearRampToValueAtTime(
      0,
      ctx.currentTime + fadeStart + 2,
    );
    gainNodeRef.current = gain;
    source.connect(gain);
    gain.connect(ctx.destination);

    const trimmedDuration = trimEnd - trimStart;
    const audioStartDelay = Math.max(0, audioOffset);
    const videoStartTime = Math.max(0, -audioOffset);

    // Clamp audio so it doesn't play past video end
    const maxAudioPlayDuration = Math.max(
      0,
      videoDuration - audioStartDelay,
    );
    const actualAudioDuration = Math.min(
      trimmedDuration,
      maxAudioPlayDuration,
    );

    video.currentTime = 0;

    if (audioStartDelay > 0) {
      source.start(
        ctx.currentTime + audioStartDelay,
        trimStart,
        actualAudioDuration,
      );
    } else {
      const skipAmount = Math.max(0, -audioOffset);
      source.start(
        ctx.currentTime,
        trimStart + skipAmount,
        Math.min(trimmedDuration - skipAmount, videoDuration),
      );
    }
    audioSourceRef.current = source;
    video.play().catch(() => {});
    setIsPreviewing(true);

    // Stop audio when video ends
    const onVideoEnded = () => {
      try {
        source.stop();
      } catch {}
      setIsPreviewing(false);
      video.removeEventListener("ended", onVideoEnded);
    };
    video.addEventListener("ended", onVideoEnded);

    const updateTime = () => {
      if (videoRef.current) {
        setPreviewTime(videoRef.current.currentTime);
        if (
          !videoRef.current.paused &&
          !videoRef.current.ended
        ) {
          previewRAFRef.current =
            requestAnimationFrame(updateTime);
        } else {
          try {
            source.stop();
          } catch {}
          setIsPreviewing(false);
        }
      }
    };
    previewRAFRef.current = requestAnimationFrame(updateTime);
  };

  const stopPreview = () => {
    try {
      audioSourceRef.current?.stop();
    } catch {}
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (previewRAFRef.current)
      cancelAnimationFrame(previewRAFRef.current);
    setIsPreviewing(false);
    setPreviewTime(0);
  };

  useEffect(() => {
    if (gainNodeRef.current)
      gainNodeRef.current.gain.value = isMuted
        ? 0
        : audioVolume;
  }, [audioVolume, isMuted]);

  // Merge
  const mergeAndDownload = async () => {
    if (!audioBuffer || !videoBlob) return;
    setIsMerging(true);
    setMergeProgress("Preparing merge...");

    // ── CRITICAL: Force WebM+Opus for the merged output ─────────────────────
    // Chrome's MediaRecorder silently drops audio tracks when recording as
    // video/mp4. WebM+Opus is the only format where MediaRecorder reliably
    // captures an audio stream in all Chromium-based browsers.
    let recorderMime = "";
    for (const candidate of [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ]) {
      try {
        if (MediaRecorder.isTypeSupported(candidate)) {
          recorderMime = candidate;
          break;
        }
      } catch {}
    }
    if (!recorderMime) {
      setMergeProgress(
        "Error: browser does not support WebM recording",
      );
      setIsMerging(false);
      return;
    }

    // ── Create AudioContext SYNCHRONOUSLY before any await ───────────────────
    // This is the user-gesture window. After any await the browser may refuse
    // to resume a suspended context.
    const liveCtx = new AudioContext({
      sampleRate: audioBuffer.sampleRate,
    });
    // Fire-and-forget resume — gets the clock ticking immediately.
    liveCtx.resume().catch(() => {});

    const mergeVideoUrl = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = mergeVideoUrl;

    try {
      await new Promise<void>((resolve, reject) => {
        video.oncanplaythrough = () => resolve();
        video.onerror = () =>
          reject(new Error("Could not load video for merge"));
        video.load();
      });
      video.currentTime = 0;

      let actualDuration = video.duration;
      if (!isFinite(actualDuration) || isNaN(actualDuration))
        actualDuration = videoDuration;
      if (!actualDuration || actualDuration <= 0)
        throw new Error("Could not determine video duration");

      // ── Offline render: bake timing + trim + volume into a single buffer ──
      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(actualDuration * audioBuffer.sampleRate),
        audioBuffer.sampleRate,
      );
      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = audioBuffer;
      const offlineGain = offlineCtx.createGain();
      offlineGain.gain.value = isMuted ? 0 : audioVolume; // volume baked here
      const fadeSaveStart = Math.max(0, actualDuration - 2);
      offlineGain.gain.setValueAtTime(
        isMuted ? 0 : audioVolume,
        fadeSaveStart,
      );
      offlineGain.gain.linearRampToValueAtTime(
        0,
        actualDuration,
      );
      offlineSource.connect(offlineGain);
      offlineGain.connect(offlineCtx.destination);

      const trimmedDuration = trimEnd - trimStart;
      const audioStartDelay = Math.max(0, audioOffset);
      const audioClipStart =
        trimStart + Math.max(0, -audioOffset);
      const audioClipDuration = Math.max(
        0,
        trimmedDuration - Math.max(0, -audioOffset),
      );

      if (audioClipDuration > 0) {
        if (audioStartDelay > 0)
          offlineSource.start(
            audioStartDelay,
            trimStart,
            trimmedDuration,
          );
        else
          offlineSource.start(
            0,
            audioClipStart,
            audioClipDuration,
          );
      }

      setMergeProgress("Rendering audio...");
      const renderedBuffer = await offlineCtx.startRendering();

      // ── Ensure liveCtx is running after the (potentially long) offline render ──
      if (liveCtx.state !== "running") {
        await liveCtx.resume();
      }

      // Route rendered audio into a MediaStream
      const liveSource = liveCtx.createBufferSource();
      liveSource.buffer = renderedBuffer;
      const streamDest = liveCtx.createMediaStreamDestination();
      // Direct connection — no extra gain. Offline render already applied audioVolume.
      liveSource.connect(streamDest);

      const audioTracks = streamDest.stream.getAudioTracks();
      if (audioTracks.length === 0)
        throw new Error(
          "No audio track from AudioContext — try Chrome or Firefox",
        );

      // Canvas for drawing video frames
      const mergeCanvas = document.createElement("canvas");
      mergeCanvas.width = canvasW;
      mergeCanvas.height = canvasH;
      const mergeCtx = mergeCanvas.getContext("2d")!;

      const canvasStream = mergeCanvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          mimeType: recorderMime,
        });
      } catch {
        recorder = new MediaRecorder(combinedStream);
      }
      const finalMime = recorder.mimeType || recorderMime;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const mergePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: finalMime }));
      });

      // ── Start recording + audio + video as tightly as possible ───────────
      // timeslice=100 → ondataavailable fires every 100 ms (more reliable than waiting for stop)
      recorder.start(100);
      // Start audio immediately at the context's current time
      liveSource.start(liveCtx.currentTime);
      setMergeProgress("Recording merged video...");

      // Play video — muted=true bypasses browser autoplay block
      video.currentTime = 0;
      await video.play();

      // ── Use setInterval instead of requestAnimationFrame ─────────────────
      // rAF is throttled or completely stopped when the tab loses focus or the
      // browser decides to deprioritise it. setInterval keeps firing at a steady
      // ~30 fps cadence regardless of tab visibility, so the canvas always stays
      // in sync with the playing video for the full duration of the merge.
      let frameInterval: ReturnType<typeof setInterval> | null =
        null;

      const finishMerge = () => {
        if (!frameInterval) return; // already called
        clearInterval(frameInterval);
        frameInterval = null;
        // Give the recorder 600 ms to flush the final audio tail before stopping
        setTimeout(() => {
          try {
            recorder.stop();
          } catch {}
          try {
            liveSource.stop();
          } catch {}
        }, 600);
      };

      // Safety net: also trigger finish when the video element fires 'ended'
      video.addEventListener("ended", finishMerge, {
        once: true,
      });

      frameInterval = setInterval(() => {
        if (video.ended) {
          finishMerge();
          return;
        }
        // Draw current video frame to the merge canvas.
        // If the video is momentarily paused (e.g. micro-stall) we still keep
        // the interval alive — we just skip drawImage for that tick so the last
        // good frame stays on canvas and the recorder keeps a valid video track.
        if (!video.paused) {
          mergeCtx.drawImage(video, 0, 0, canvasW, canvasH);
        }
        setMergeProgress(
          `Merging... ${Math.round((video.currentTime / actualDuration) * 100)}%`,
        );
      }, 1000 / 30); // 30 fps — matches the captureStream(30) rate

      const mergedBlob = await mergePromise;
      // Output is always WebM (not mp4) because that's what MediaRecorder supports with audio
      const dlUrl = URL.createObjectURL(mergedBlob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = "one-line-art-with-audio.webm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 10000);

      setMergeProgress("Done!");
      setTimeout(() => setMergeProgress(""), 2000);
    } catch (err: any) {
      console.error("Merge error:", err);
      setMergeProgress(`Error: ${err.message}`);
      setTimeout(() => setMergeProgress(""), 5000);
    } finally {
      URL.revokeObjectURL(mergeVideoUrl);
      try {
        liveCtx.close();
      } catch {}
      setIsMerging(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return m > 0
      ? `${m}:${String(sec).padStart(2, "0")}.${ms}`
      : `${sec}.${ms}s`;
  };

  const trimmedLength = trimEnd - trimStart;
  const hasAudio = !!audioFile && !!audioBuffer;
  const audioExceedsVideo =
    hasAudio &&
    videoDuration > 0 &&
    audioOffset + trimmedLength > videoDuration;
  const audioCoversVideo =
    hasAudio &&
    videoDuration > 0 &&
    audioOffset <= 0 &&
    trimmedLength >= videoDuration;

  return (
    <div
      className={`${panelCls} p-6 rounded-2xl transition-colors duration-300`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
          <Check className="w-4 h-4 text-emerald-400" />
        </div>
        <span className={`font-semibold ${textCls}`}>
          Video Ready!
        </span>
        {videoDuration > 0 && (
          <span className={`text-xs ${mutedCls} ml-auto`}>
            {formatTime(videoDuration)}
          </span>
        )}
      </div>

      {/* Video Player */}
      <video
        ref={videoRef}
        src={videoUrl}
        controls={!hasAudio}
        className={`w-full rounded-xl mb-4 object-contain ${inverted ? "bg-neutral-900" : "bg-neutral-100"}`}
        style={{ aspectRatio: `${canvasW}/${canvasH}` }}
      />

      {!mimeType.includes("mp4") && (
        <p
          className={`text-xs ${mutedCls} mb-3 flex items-center gap-1.5`}
        >
          Your browser recorded in WebM format. For MP4
          conversion, use a free tool like{" "}
          <a
            href="https://cloudconvert.com/webm-to-mp4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline"
          >
            CloudConvert
          </a>
          .
        </p>
      )}

      {/* Download video (no audio) */}
      {!hasAudio && (
        <button
          onClick={onDownloadVideoOnly}
          className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 mb-4"
        >
          <Download className="w-5 h-5" /> Download Video (
          {mimeType.includes("mp4") ? ".mp4" : ".webm"})
        </button>
      )}

      {/* Audio section */}
      {!hasAudio && !showAudioTools ? (
        <div
          className={`rounded-xl border-2 border-dashed p-4 text-center ${
            inverted
              ? "border-white/[0.1] bg-white/[0.02]"
              : "border-neutral-200 bg-neutral-50"
          }`}
        >
          <label className="cursor-pointer flex items-center justify-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            <span
              className={`text-sm ${labelCls} hover:text-purple-400 transition-colors`}
            >
              Add audio track...
            </span>
            <input
              ref={addAudioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : hasAudio ? (
        <div className="space-y-4">
          {/* Audio file info + actions */}
          <div
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${inverted ? "bg-white/[0.03] border border-white/[0.06]" : "bg-neutral-50 border border-neutral-200"}`}
          >
            <Music className="w-4 h-4 text-purple-400 shrink-0" />
            <span
              className={`text-xs ${labelCls} truncate flex-1`}
            >
              {audioFile!.name}
            </span>
            <span className={`text-xs ${mutedCls}`}>
              {formatTime(audioDuration)}
            </span>
            <label
              className={`text-xs cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                inverted
                  ? "text-indigo-400 hover:bg-white/5"
                  : "text-indigo-500 hover:bg-indigo-50"
              }`}
            >
              <Replace className="w-3 h-3" /> Replace
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleAudioUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={removeAudio}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors px-1 py-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Waveform on video timeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs font-medium ${labelCls}`}
              >
                <Scissors className="w-3 h-3 inline mr-1" />
                Audio on Video Timeline
              </span>
              <div className="flex items-center gap-3">
                {audioExceedsVideo && (
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                    Audio exceeds video
                  </span>
                )}
                <span className={`text-xs ${mutedCls}`}>
                  Trimmed: {formatTime(trimmedLength)}
                </span>
              </div>
            </div>

            {/* Video duration ruler */}
            <div
              className={`flex items-center justify-between px-1 mb-1`}
            >
              <span className={`text-[9px] ${mutedCls}`}>
                0s
              </span>
              {videoDuration > 0 && (
                <>
                  <span className={`text-[9px] ${mutedCls}`}>
                    {formatTime(videoDuration / 2)}
                  </span>
                  <span className={`text-[9px] ${mutedCls}`}>
                    {formatTime(videoDuration)}
                  </span>
                </>
              )}
            </div>

            <div className="relative">
              <canvas
                ref={waveformCanvasRef}
                width={800}
                height={80}
                className="w-full rounded-lg cursor-col-resize"
                style={{ height: "80px" }}
                onMouseDown={handleWaveformMouseDown}
              />
              {/* Video end marker label */}
              {videoDuration > 0 && audioExceedsVideo && (
                <div className="absolute top-0 right-0 text-[8px] text-red-400 bg-red-500/10 px-1 rounded-bl">
                  past video end
                </div>
              )}
            </div>

            <div className="flex justify-between mt-1 px-1">
              <span className={`text-[10px] text-purple-400`}>
                Audio starts: {formatTime(audioOffset)}
              </span>
              <span
                className={`text-[10px] ${audioExceedsVideo ? "text-amber-400" : "text-purple-400"}`}
              >
                Audio ends:{" "}
                {formatTime(audioOffset + trimmedLength)}
              </span>
            </div>
          </div>

          {/* Trim controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] ${labelCls}`}>
                  Trim Start
                </span>
                <span className="text-[10px] text-purple-400 font-mono">
                  {formatTime(trimStart)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, trimEnd - 0.1)}
                step={0.1}
                value={trimStart}
                onChange={(e) =>
                  setTrimStart(Number(e.target.value))
                }
                className={sliderTrack}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] ${labelCls}`}>
                  Trim End
                </span>
                <span className="text-[10px] text-purple-400 font-mono">
                  {formatTime(trimEnd)}
                </span>
              </div>
              <input
                type="range"
                min={Math.max(0, trimStart + 0.1)}
                max={audioDuration}
                step={0.1}
                value={trimEnd}
                onChange={(e) =>
                  setTrimEnd(Number(e.target.value))
                }
                className={sliderTrack}
              />
            </div>
          </div>

          {/* Audio Offset */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span
                className={`text-xs font-medium ${labelCls}`}
              >
                Audio Offset
              </span>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded">
                {audioOffset >= 0 ? "+" : ""}
                {audioOffset.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, videoDuration - 0.5)}
              step={0.1}
              value={audioOffset}
              onChange={(e) =>
                setAudioOffset(Number(e.target.value))
              }
              className={sliderTrack}
            />
          </div>

          {/* Volume */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span
                className={`text-xs font-medium ${labelCls} flex items-center gap-1.5`}
              >
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="hover:text-indigo-400 transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                Volume
              </span>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded">
                {isMuted
                  ? "Muted"
                  : `${Math.round(audioVolume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              onChange={(e) =>
                setAudioVolume(Number(e.target.value))
              }
              disabled={isMuted}
              className={sliderTrack}
            />
          </div>

          {/* Preview & Merge buttons */}
          <div className="flex gap-2">
            <button
              onClick={
                isPreviewing ? stopPreview : startPreview
              }
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                isPreviewing
                  ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                  : inverted
                    ? "bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.08]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-200"
              }`}
            >
              {isPreviewing ? (
                <>
                  <Pause className="w-4 h-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Preview
                </>
              )}
            </button>
            <button
              onClick={mergeAndDownload}
              disabled={isMerging}
              className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-purple-500/20"
            >
              {isMerging ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />{" "}
                  {mergeProgress}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Save with
                  Audio (.webm)
                </>
              )}
            </button>
          </div>

          {/* Also allow downloading without audio */}
          <button
            onClick={onDownloadVideoOnly}
            className={`w-full py-2 text-xs rounded-lg transition-colors ${
              inverted
                ? "text-neutral-400 hover:text-white hover:bg-white/5"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            Download video without audio
          </button>

          {mergeProgress && !isMerging && (
            <p
              className={`text-xs text-center ${mergeProgress.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}
            >
              {mergeProgress}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}