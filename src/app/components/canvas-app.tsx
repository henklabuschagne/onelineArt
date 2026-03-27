import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  Square,
  Video,
  RefreshCw,
  UploadCloud,
  Loader2,
  Clock,
  Undo2,
  Wand2,
  SunMoon,
  Plus,
  X,
  Film,
  Image as ImageIcon,
  GripVertical,
  Music,
  Volume2,
  Check,
} from "lucide-react";
import { API_MODE } from "../config";
import { useAuth } from "./auth-context";
import { useTheme } from "./theme-context";
import { deductCredits, generateAiImage } from "./api";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { AudioEditor } from "./audio-editor";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const JUMP_THRESHOLD_SQ = 25;

type Point = { x: number; y: number };
interface StoryImage {
  id: string;
  file: File;
  thumbUrl: string;
  points: Point[];
  processing: boolean;
}

export function CanvasApp() {
  const { credits, refreshProfile } = useAuth();
  const { inverted, toggleInvert } = useTheme();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const mimeTypeRef = useRef<string>("video/mp4");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePoints, setImagePoints] = useState<Point[]>([]);
  const [pointDensity, setPointDensity] = useState(300000);
  const [isProcessing, setIsProcessing] = useState(false);

  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(1.5);
  const [speed, setSpeed] = useState(50);
  const [reverseEnabled, setReverseEnabled] = useState(false);

  // Story mode state
  const [mode, setMode] = useState<"single" | "story">(
    "single",
  );
  const [storyImages, setStoryImages] = useState<StoryImage[]>(
    [],
  );
  const [storyWaitTime, setStoryWaitTime] = useState(2); // seconds between images
  const [storyReverse, setStoryReverse] = useState(true); // reverse-erase before next image
  const [storyProgress, setStoryProgress] = useState("");
  const [reverseSpeedMultiplier, setReverseSpeedMultiplier] =
    useState(3); // how many times faster reverse is

  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratingCount, setAiGeneratingCount] = useState(0); // track parallel AI generations
  const [aiError, setAiError] = useState<string | null>(null);

  // Audio track state (persists across record → post-edit flow)
  const [bgAudioFile, setBgAudioFile] = useState<File | null>(
    null,
  );
  const [bgAudioBuffer, setBgAudioBuffer] =
    useState<AudioBuffer | null>(null);
  const [bgAudioVolume, setBgAudioVolume] = useState(0.7);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number>(0);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const stoppedEarlyRef = useRef(false);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveAudioSourceRef =
    useRef<AudioBufferSourceNode | null>(null);

  // ── Reusable image→points processor ──
  const processFileToPoints = useCallback(
    (file: File, density: number): Promise<Point[]> => {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const padding = 20;
          const availableW = CANVAS_W - padding * 2;
          const availableH = CANVAS_H - padding * 2;
          const displayScale = Math.min(
            availableW / img.width,
            availableH / img.height,
          );
          const displayW = img.width * displayScale;
          const displayH = img.height * displayScale;
          const offsetX = (CANVAS_W - displayW) / 2;
          const offsetY = (CANVAS_H - displayH) / 2;

          const offCanvas = document.createElement("canvas");
          const traceW = Math.floor(displayW);
          const traceH = Math.floor(displayH);
          offCanvas.width = traceW;
          offCanvas.height = traceH;
          const ctx = offCanvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, traceW, traceH);
          ctx.drawImage(img, 0, 0, traceW, traceH);
          const data = ctx.getImageData(
            0,
            0,
            traceW,
            traceH,
          ).data;

          const darkPixels: Point[] = [];
          const threshold = 200;
          for (let y = 0; y < traceH; y++) {
            for (let x = 0; x < traceW; x++) {
              const i = (y * traceW + x) * 4;
              const lum =
                0.299 * data[i] +
                0.587 * data[i + 1] +
                0.114 * data[i + 2];
              if (lum < threshold)
                darkPixels.push({
                  x: offsetX + x,
                  y: offsetY + y,
                });
            }
          }

          let points: Point[];
          if (darkPixels.length <= density) {
            points = darkPixels;
          } else {
            const step = darkPixels.length / density;
            points = [];
            for (let i = 0; i < density; i++)
              points.push(darkPixels[Math.floor(i * step)]);
          }

          const gridSz = 4;
          const gCols = Math.ceil(CANVAS_W / gridSz);
          const gRows = Math.ceil(CANVAS_H / gridSz);
          const grid: Map<number, number[]> = new Map();
          for (let i = 0; i < points.length; i++) {
            const key =
              Math.floor(points[i].y / gridSz) * gCols +
              Math.floor(points[i].x / gridSz);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push(i);
          }

          const clusterRadius = 3;
          const pointCluster = new Int32Array(
            points.length,
          ).fill(-1);
          let clusterCount = 0;
          const clusters: number[][] = [];
          for (let seed = 0; seed < points.length; seed++) {
            if (pointCluster[seed] !== -1) continue;
            const clusterId = clusterCount++;
            const cluster: number[] = [];
            const queue = [seed];
            pointCluster[seed] = clusterId;
            while (queue.length > 0) {
              const cur = queue.pop()!;
              cluster.push(cur);
              const cx = Math.floor(points[cur].x / gridSz);
              const cy = Math.floor(points[cur].y / gridSz);
              for (
                let dy = -clusterRadius;
                dy <= clusterRadius;
                dy++
              ) {
                for (
                  let dx = -clusterRadius;
                  dx <= clusterRadius;
                  dx++
                ) {
                  const nr = cy + dy,
                    nc = cx + dx;
                  if (
                    nr < 0 ||
                    nr >= gRows ||
                    nc < 0 ||
                    nc >= gCols
                  )
                    continue;
                  const cell = grid.get(nr * gCols + nc);
                  if (!cell) continue;
                  for (const idx of cell) {
                    if (pointCluster[idx] !== -1) continue;
                    pointCluster[idx] = clusterId;
                    queue.push(idx);
                  }
                }
              }
            }
            clusters.push(cluster);
          }

          clusters.sort((a, b) => b.length - a.length);

          const visited = new Uint8Array(points.length);
          const path: Point[] = [];
          const nnGrid: Map<number, number[]> = new Map();
          for (let i = 0; i < points.length; i++) {
            const key =
              Math.floor(points[i].y / gridSz) * gCols +
              Math.floor(points[i].x / gridSz);
            if (!nnGrid.has(key)) nnGrid.set(key, []);
            nnGrid.get(key)!.push(i);
          }
          const removeFromNNGrid = (idx: number) => {
            const key =
              Math.floor(points[idx].y / gridSz) * gCols +
              Math.floor(points[idx].x / gridSz);
            const arr = nnGrid.get(key);
            if (arr) {
              const pos = arr.indexOf(idx);
              if (pos !== -1) arr.splice(pos, 1);
            }
          };

          let lastX = 0,
            lastY = 0;
          for (const cluster of clusters) {
            if (cluster.length === 0) continue;
            let startIdx = cluster[0];
            if (path.length > 0) {
              let bestD = Infinity;
              for (const idx of cluster) {
                if (visited[idx]) continue;
                const d =
                  (points[idx].x - lastX) ** 2 +
                  (points[idx].y - lastY) ** 2;
                if (d < bestD) {
                  bestD = d;
                  startIdx = idx;
                }
              }
            }
            let ci = startIdx;
            if (visited[ci]) continue;
            visited[ci] = 1;
            removeFromNNGrid(ci);
            path.push(points[ci]);

            for (let iter = 1; iter < cluster.length; iter++) {
              const cx = points[ci].x,
                cy = points[ci].y;
              const gcx = Math.floor(cx / gridSz),
                gcy = Math.floor(cy / gridSz);
              let bestIdx = -1,
                bestDist = Infinity;
              for (
                let rad = 0;
                rad <= Math.max(gCols, gRows);
                rad++
              ) {
                if (bestDist < ((rad - 1) * gridSz) ** 2) break;
                for (let dy = -rad; dy <= rad; dy++) {
                  for (let dx = -rad; dx <= rad; dx++) {
                    if (
                      Math.abs(dx) !== rad &&
                      Math.abs(dy) !== rad
                    )
                      continue;
                    const nr = gcy + dy,
                      nc = gcx + dx;
                    if (
                      nr < 0 ||
                      nr >= gRows ||
                      nc < 0 ||
                      nc >= gCols
                    )
                      continue;
                    const cell = nnGrid.get(nr * gCols + nc);
                    if (!cell || cell.length === 0) continue;
                    for (const idx of cell) {
                      if (visited[idx]) continue;
                      if (
                        pointCluster[idx] !==
                        pointCluster[startIdx]
                      )
                        continue;
                      const d =
                        (cx - points[idx].x) ** 2 +
                        (cy - points[idx].y) ** 2;
                      if (d < bestDist) {
                        bestDist = d;
                        bestIdx = idx;
                      }
                    }
                  }
                }
                if (
                  bestIdx !== -1 &&
                  bestDist <= ((rad + 1) * gridSz) ** 2
                )
                  break;
              }
              if (bestIdx === -1) break;
              visited[bestIdx] = 1;
              removeFromNNGrid(bestIdx);
              path.push(points[bestIdx]);
              ci = bestIdx;
            }
            lastX = points[ci].x;
            lastY = points[ci].y;
          }

          URL.revokeObjectURL(url);
          resolve(path);
        };
        img.src = url;
      });
    },
    [],
  );

  // ── Story mode: add image ──
  const addStoryImage = async (file: File) => {
    if (storyImages.length >= 10) {
      toast.error("Maximum 10 images allowed");
      return;
    }
    const id = crypto.randomUUID();
    const thumbUrl = URL.createObjectURL(file);
    const newImg: StoryImage = {
      id,
      file,
      thumbUrl,
      points: [],
      processing: true,
    };
    setStoryImages((prev) => [...prev, newImg]);
    const pts = await processFileToPoints(file, pointDensity);
    setStoryImages((prev) =>
      prev.map((si) =>
        si.id === id
          ? { ...si, points: pts, processing: false }
          : si,
      ),
    );
  };

  const removeStoryImage = (id: string) => {
    setStoryImages((prev) => {
      const removed = prev.find((si) => si.id === id);
      if (removed) URL.revokeObjectURL(removed.thumbUrl);
      return prev.filter((si) => si.id !== id);
    });
  };

  const moveStoryImage = (idx: number, dir: -1 | 1) => {
    setStoryImages((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const handleStoryUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files) return;
    for (
      let i = 0;
      i < files.length && storyImages.length + i < 10;
      i++
    ) {
      addStoryImage(files[i]);
    }
    e.target.value = "";
  };

  // ── Story mode: credit calculation ──
  const storyCredits = useMemo(() => {
    const count = storyImages.length;
    return { video: count * 5, total: count * 5 };
  }, [storyImages.length]);

  // ── Duration estimation helpers ──────────────────────────────────────────
  // requestAnimationFrame fires at the DISPLAY refresh rate (~60 Hz), NOT at the
  // video capture rate (30 fps). Every loop iteration is one rAF tick, so we
  // must divide tick counts by 60 to get real-time seconds. The old code used
  // /30, making every estimate roughly 2× too long.
  const RAF_FPS = 60;

  const fmtEstimate = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.round(s % 60);
    return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
  };

  // Single-image seconds
  const calcSingleSeconds = (
    numPoints: number,
    spd: number,
    reverse: boolean,
    revMult: number,
  ) => {
    const batch = spd * 8;
    const leadIn = 30 / RAF_FPS; // 30 rAF ticks = 0.5 s
    const draw = Math.ceil(numPoints / batch) / RAF_FPS;
    const rev = reverse
      ? Math.ceil(numPoints / (batch * revMult)) / RAF_FPS
      : 0;
    return leadIn + draw + rev;
  };

  // Story total seconds
  const calcStorySeconds = (
    images: StoryImage[],
    spd: number,
    reverse: boolean,
    revMult: number,
    waitTime: number,
  ) => {
    const batch = spd * 8;
    const leadIn = 30 / RAF_FPS; // one lead-in for the whole story
    let sec = leadIn;
    for (const si of images) {
      sec += Math.ceil(si.points.length / batch) / RAF_FPS; // draw phase
      if (reverse)
        sec +=
          Math.ceil(si.points.length / (batch * revMult)) /
          RAF_FPS; // erase phase
    }
    // Between each image (not after the last):
    //   - wait:  waitTime * 30 rAF ticks  →  waitTime * 30 / 60 real seconds
    //   - wipe:  WIPE_DURATION=30 rAF ticks → 30 / 60 = 0.5 s (only when not reversing)
    const waitSec = (waitTime * 30) / RAF_FPS;
    const wipeSec = reverse ? 0 : 30 / RAF_FPS;
    sec += (images.length - 1) * (waitSec + wipeSec);
    return sec;
  };

  // ── Story mode: estimated duration ──
  const storyEstimatedDuration = useMemo(() => {
    if (storyImages.length === 0) return null;
    return fmtEstimate(
      calcStorySeconds(
        storyImages,
        speed,
        storyReverse,
        reverseSpeedMultiplier,
        storyWaitTime,
      ),
    );
  }, [
    storyImages,
    speed,
    storyReverse,
    storyWaitTime,
    reverseSpeedMultiplier,
  ]);

  // ── Story mode: recording ──
  const startStoryRecording = async () => {
    // Clean up any lingering animation/recording from previous mode
    if (animationRef.current)
      cancelAnimationFrame(animationRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
    }

    const readyImages = storyImages.filter(
      (si) => si.points.length > 0 && !si.processing,
    );
    if (readyImages.length === 0) return;

    // Credit check
    if (API_MODE !== "mock") {
      const neededVideo = readyImages.length;
      if (!credits || credits.videoCredits < neededVideo) {
        toast.error(
          `Not enough video credits! Need ${neededVideo}, have ${credits?.videoCredits ?? 0}.`,
        );
        navigate("/pricing");
        return;
      }
      for (let i = 0; i < neededVideo; i++) {
        const result = await deductCredits("video");
        if (result.error) {
          toast.error(result.error);
          return;
        }
      }
      await refreshProfile();
      toast.success(
        `${neededVideo} video credits used for story`,
      );
    } else {
      toast.success(
        `Story recording started (mock mode, ${readyImages.length} images)`,
      );
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    setVideoUrl(null);
    clearCanvas();
    setIsDrawing(true);
    setIsRecording(true);
    chunksRef.current = [];
    stoppedEarlyRef.current = false;

    const stream = canvas.captureStream(30);
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeTypeRef.current,
      });
    } catch {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.onstop = () => {
      if (stoppedEarlyRef.current) {
        chunksRef.current = [];
        setIsRecording(false);
        return;
      }
      const blob = new Blob(chunksRef.current, {
        type: mimeTypeRef.current,
      });
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setIsRecording(false);
    };
    mediaRecorderRef.current.start();
    startLiveAudio();

    const ctx = canvas.getContext("2d")!;
    let imgIdx = 0;
    let phase: "leadIn" | "draw" | "reverse" | "wait" | "wipe" =
      "leadIn";
    let currentPoint = 0;
    let reversePoint = 0;
    let waitFrames = 0;
    let wipeProgress = 0;
    let leadInFrames = 30; // 1 second at 30fps
    const WIPE_DURATION = 30; // frames (~1 second)
    let currentPoints = readyImages[0].points;

    const fillCanvas = () => {
      ctx.fillStyle = inverted ? "#000000" : "#ffffff";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    };

    fillCanvas();

    setStoryProgress(`Starting...`);

    const drawFrame = () => {
      if (stoppedEarlyRef.current) return;

      if (phase === "leadIn") {
        leadInFrames--;
        if (leadInFrames <= 0) {
          phase = "draw";
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
          setStoryProgress(
            `Drawing image 1 of ${readyImages.length}`,
          );
        }
        animationRef.current = requestAnimationFrame(drawFrame);
        return;
      }
      if (phase === "draw") {
        if (currentPoint >= currentPoints.length - 1) {
          ctx.stroke();
          if (storyReverse) {
            phase = "reverse";
            reversePoint = currentPoints.length - 1;
            setStoryProgress(
              `Erasing image ${imgIdx + 1} of ${readyImages.length}`,
            );
            animationRef.current =
              requestAnimationFrame(drawFrame);
            return;
          }
          // Move to wipe transition or finish
          if (imgIdx < readyImages.length - 1) {
            phase = "wipe";
            wipeProgress = 0;
            setStoryProgress(
              `Transitioning to image ${imgIdx + 2}...`,
            );
            animationRef.current =
              requestAnimationFrame(drawFrame);
          } else {
            setStoryProgress("");
            setIsDrawing(false);
            stopLiveAudio();
            if (mediaRecorderRef.current?.state !== "inactive")
              mediaRecorderRef.current?.stop();
          }
          return;
        }
        const batchSize = speed * 8;
        for (
          let i = 0;
          i < batchSize &&
          currentPoint < currentPoints.length - 1;
          i++
        ) {
          currentPoint++;
          const dx =
            currentPoints[currentPoint].x -
            currentPoints[currentPoint - 1].x;
          const dy =
            currentPoints[currentPoint].y -
            currentPoints[currentPoint - 1].y;
          if (dx * dx + dy * dy > JUMP_THRESHOLD_SQ) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(
              currentPoints[currentPoint].x,
              currentPoints[currentPoint].y,
            );
          } else {
            ctx.lineTo(
              currentPoints[currentPoint].x,
              currentPoints[currentPoint].y,
            );
          }
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(
          currentPoints[currentPoint].x,
          currentPoints[currentPoint].y,
        );
      } else if (phase === "reverse") {
        if (reversePoint <= 0) {
          fillCanvas();
          if (imgIdx < readyImages.length - 1) {
            phase = "wait";
            waitFrames = storyWaitTime * 30;
            setStoryProgress(
              `Pause before image ${imgIdx + 2}...`,
            );
          } else {
            setStoryProgress("");
            setIsDrawing(false);
            stopLiveAudio();
            if (mediaRecorderRef.current?.state !== "inactive")
              mediaRecorderRef.current?.stop();
            animationRef.current =
              requestAnimationFrame(drawFrame);
            return;
          }
          animationRef.current =
            requestAnimationFrame(drawFrame);
          return;
        }
        ctx.strokeStyle = inverted ? "#000000" : "#ffffff";
        ctx.lineWidth = lineWidth + 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const reverseBatch = speed * 8 * reverseSpeedMultiplier;
        ctx.beginPath();
        ctx.moveTo(
          currentPoints[reversePoint].x,
          currentPoints[reversePoint].y,
        );
        for (
          let i = 0;
          i < reverseBatch && reversePoint > 0;
          i++
        ) {
          reversePoint--;
          const dx =
            currentPoints[reversePoint].x -
            currentPoints[reversePoint + 1].x;
          const dy =
            currentPoints[reversePoint].y -
            currentPoints[reversePoint + 1].y;
          if (dx * dx + dy * dy > JUMP_THRESHOLD_SQ) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(
              currentPoints[reversePoint].x,
              currentPoints[reversePoint].y,
            );
          } else {
            ctx.lineTo(
              currentPoints[reversePoint].x,
              currentPoints[reversePoint].y,
            );
          }
        }
        ctx.stroke();
      } else if (phase === "wipe") {
        // Cool horizontal wipe effect: a band sweeps across clearing the canvas
        wipeProgress++;
        const t = wipeProgress / WIPE_DURATION; // 0→1
        const easedT =
          t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const wipeX = easedT * CANVAS_W;
        const bgColor = inverted ? "#000000" : "#ffffff";

        // Clean wipe: clear everything behind the wipe line
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, wipeX, CANVAS_H);

        if (wipeProgress >= WIPE_DURATION) {
          fillCanvas();
          if (storyWaitTime > 0) {
            phase = "wait";
            waitFrames = storyWaitTime * 30;
            setStoryProgress(
              `Pause before image ${imgIdx + 2}...`,
            );
          } else {
            // Skip wait, go straight to next image
            imgIdx++;
            currentPoints = readyImages[imgIdx].points;
            currentPoint = 0;
            phase = "draw";
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
            setStoryProgress(
              `Drawing image ${imgIdx + 1} of ${readyImages.length}`,
            );
          }
        }
      } else if (phase === "wait") {
        waitFrames--;
        if (waitFrames <= 0) {
          // Move to next image
          imgIdx++;
          currentPoints = readyImages[imgIdx].points;
          currentPoint = 0;
          phase = "draw";
          fillCanvas();
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
          setStoryProgress(
            `Drawing image ${imgIdx + 1} of ${readyImages.length}`,
          );
        }
      }
      animationRef.current = requestAnimationFrame(drawFrame);
    };
    animationRef.current = requestAnimationFrame(drawFrame);
  };

  const estimatedDuration = useMemo(() => {
    if (imagePoints.length === 0) return null;
    return fmtEstimate(
      calcSingleSeconds(
        imagePoints.length,
        speed,
        reverseEnabled,
        reverseSpeedMultiplier,
      ),
    );
  }, [
    imagePoints.length,
    speed,
    reverseEnabled,
    reverseSpeedMultiplier,
  ]);

  // Raw seconds for audio vs video duration comparison
  const estimatedRawSeconds = useMemo(() => {
    if (imagePoints.length === 0) return 0;
    return calcSingleSeconds(
      imagePoints.length,
      speed,
      reverseEnabled,
      reverseSpeedMultiplier,
    );
  }, [
    imagePoints.length,
    speed,
    reverseEnabled,
    reverseSpeedMultiplier,
  ]);

  const storyEstimatedRawSeconds = useMemo(() => {
    if (storyImages.length === 0) return 0;
    return calcStorySeconds(
      storyImages,
      speed,
      storyReverse,
      reverseSpeedMultiplier,
      storyWaitTime,
    );
  }, [
    storyImages,
    speed,
    storyReverse,
    storyWaitTime,
    reverseSpeedMultiplier,
  ]);

  // Format seconds for the audio/video comparison chips
  const fmtSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  useEffect(() => {
    const types = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=h264",
      "video/webm",
      "video/mp4",
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        mimeTypeRef.current = t;
        break;
      }
    }
    clearCanvas();
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = inverted ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (!imageFile) return;
    let isCancelled = false;
    setIsProcessing(true);
    const url = URL.createObjectURL(imageFile);
    const img = new Image();

    img.onload = () => {
      if (isCancelled) return;
      const padding = 20;
      const availableW = CANVAS_W - padding * 2;
      const availableH = CANVAS_H - padding * 2;
      const displayScale = Math.min(
        availableW / img.width,
        availableH / img.height,
      );
      const displayW = img.width * displayScale;
      const displayH = img.height * displayScale;
      const offsetX = (CANVAS_W - displayW) / 2;
      const offsetY = (CANVAS_H - displayH) / 2;

      const offCanvas = document.createElement("canvas");
      const traceW = Math.floor(displayW);
      const traceH = Math.floor(displayH);
      offCanvas.width = traceW;
      offCanvas.height = traceH;
      const ctx = offCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, traceW, traceH);
      ctx.drawImage(img, 0, 0, traceW, traceH);
      const data = ctx.getImageData(0, 0, traceW, traceH).data;

      const darkPixels: Point[] = [];
      const threshold = 200;
      for (let y = 0; y < traceH; y++) {
        for (let x = 0; x < traceW; x++) {
          const i = (y * traceW + x) * 4;
          const lum =
            0.299 * data[i] +
            0.587 * data[i + 1] +
            0.114 * data[i + 2];
          if (lum < threshold)
            darkPixels.push({ x: offsetX + x, y: offsetY + y });
        }
      }

      let points: Point[];
      if (darkPixels.length <= pointDensity) {
        points = darkPixels;
      } else {
        const step = darkPixels.length / pointDensity;
        points = [];
        for (let i = 0; i < pointDensity; i++)
          points.push(darkPixels[Math.floor(i * step)]);
      }

      const gridSz = 4;
      const gCols = Math.ceil(CANVAS_W / gridSz);
      const gRows = Math.ceil(CANVAS_H / gridSz);
      const grid: Map<number, number[]> = new Map();
      for (let i = 0; i < points.length; i++) {
        const key =
          Math.floor(points[i].y / gridSz) * gCols +
          Math.floor(points[i].x / gridSz);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(i);
      }

      // ── Phase 1: Cluster detection via flood-fill on the spatial grid ──
      const clusterRadius = 3; // grid cells — points within this distance are "connected"
      const pointCluster = new Int32Array(points.length).fill(
        -1,
      );
      let clusterCount = 0;
      const clusters: number[][] = [];

      for (let seed = 0; seed < points.length; seed++) {
        if (pointCluster[seed] !== -1) continue;
        const clusterId = clusterCount++;
        const cluster: number[] = [];
        const queue = [seed];
        pointCluster[seed] = clusterId;
        while (queue.length > 0) {
          const cur = queue.pop()!;
          cluster.push(cur);
          const cx = Math.floor(points[cur].x / gridSz);
          const cy = Math.floor(points[cur].y / gridSz);
          for (
            let dy = -clusterRadius;
            dy <= clusterRadius;
            dy++
          ) {
            for (
              let dx = -clusterRadius;
              dx <= clusterRadius;
              dx++
            ) {
              const nr = cy + dy,
                nc = cx + dx;
              if (
                nr < 0 ||
                nr >= gRows ||
                nc < 0 ||
                nc >= gCols
              )
                continue;
              const cell = grid.get(nr * gCols + nc);
              if (!cell) continue;
              for (const idx of cell) {
                if (pointCluster[idx] !== -1) continue;
                pointCluster[idx] = clusterId;
                queue.push(idx);
              }
            }
          }
        }
        clusters.push(cluster);
      }

      // ── Phase 2: Sort clusters — largest first (background → details) ──
      clusters.sort((a, b) => b.length - a.length);

      // ── Phase 3: Build path cluster-by-cluster with nearest-neighbor within each ──
      const visited = new Uint8Array(points.length);
      const path: Point[] = [];

      // Rebuild a fresh grid for nearest-neighbor search within each cluster
      const nnGrid: Map<number, number[]> = new Map();
      for (let i = 0; i < points.length; i++) {
        const key =
          Math.floor(points[i].y / gridSz) * gCols +
          Math.floor(points[i].x / gridSz);
        if (!nnGrid.has(key)) nnGrid.set(key, []);
        nnGrid.get(key)!.push(i);
      }
      const removeFromNNGrid = (idx: number) => {
        const key =
          Math.floor(points[idx].y / gridSz) * gCols +
          Math.floor(points[idx].x / gridSz);
        const arr = nnGrid.get(key);
        if (arr) {
          const pos = arr.indexOf(idx);
          if (pos !== -1) arr.splice(pos, 1);
        }
      };

      // If we have a previous cluster's last point, find the closest start in next cluster
      let lastX = 0,
        lastY = 0;

      for (const cluster of clusters) {
        if (cluster.length === 0) continue;

        // Pick the cluster point closest to where the pen currently is
        let startIdx = cluster[0];
        if (path.length > 0) {
          let bestD = Infinity;
          for (const idx of cluster) {
            if (visited[idx]) continue;
            const d =
              (points[idx].x - lastX) ** 2 +
              (points[idx].y - lastY) ** 2;
            if (d < bestD) {
              bestD = d;
              startIdx = idx;
            }
          }
        }

        // Nearest-neighbor walk within this cluster
        let ci = startIdx;
        if (visited[ci]) continue;
        visited[ci] = 1;
        removeFromNNGrid(ci);
        path.push(points[ci]);

        for (let iter = 1; iter < cluster.length; iter++) {
          const cx = points[ci].x,
            cy = points[ci].y;
          const gcx = Math.floor(cx / gridSz),
            gcy = Math.floor(cy / gridSz);
          let bestIdx = -1,
            bestDist = Infinity;
          for (
            let rad = 0;
            rad <= Math.max(gCols, gRows);
            rad++
          ) {
            if (bestDist < ((rad - 1) * gridSz) ** 2) break;
            for (let dy = -rad; dy <= rad; dy++) {
              for (let dx = -rad; dx <= rad; dx++) {
                if (
                  Math.abs(dx) !== rad &&
                  Math.abs(dy) !== rad
                )
                  continue;
                const nr = gcy + dy,
                  nc = gcx + dx;
                if (
                  nr < 0 ||
                  nr >= gRows ||
                  nc < 0 ||
                  nc >= gCols
                )
                  continue;
                const cell = nnGrid.get(nr * gCols + nc);
                if (!cell || cell.length === 0) continue;
                for (const idx of cell) {
                  if (visited[idx]) continue;
                  // Only visit points from THIS cluster (or already picked up neighbors)
                  if (
                    pointCluster[idx] !== pointCluster[startIdx]
                  )
                    continue;
                  const d =
                    (cx - points[idx].x) ** 2 +
                    (cy - points[idx].y) ** 2;
                  if (d < bestDist) {
                    bestDist = d;
                    bestIdx = idx;
                  }
                }
              }
            }
            if (
              bestIdx !== -1 &&
              bestDist <= ((rad + 1) * gridSz) ** 2
            )
              break;
          }
          if (bestIdx === -1) break;
          visited[bestIdx] = 1;
          removeFromNNGrid(bestIdx);
          path.push(points[bestIdx]);
          ci = bestIdx;
        }

        lastX = points[ci].x;
        lastY = points[ci].y;
      }

      setImagePoints(path);
      setIsProcessing(false);
    };

    img.src = url;
    return () => {
      isCancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [imageFile, pointDensity]);

  const drawPreview = () => {
    if (isDrawing || isProcessing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    clearCanvas();
    if (imagePoints.length === 0) return;
    ctx.strokeStyle = color + "40";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(imagePoints[0].x, imagePoints[0].y);
    for (let i = 1; i < imagePoints.length; i++) {
      const dx = imagePoints[i].x - imagePoints[i - 1].x;
      const dy = imagePoints[i].y - imagePoints[i - 1].y;
      if (dx * dx + dy * dy > JUMP_THRESHOLD_SQ) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(imagePoints[i].x, imagePoints[i].y);
      } else {
        ctx.lineTo(imagePoints[i].x, imagePoints[i].y);
      }
    }
    ctx.stroke();
  };

  useEffect(() => {
    if (!isDrawing && !isProcessing) drawPreview();
  }, [
    color,
    lineWidth,
    imagePoints,
    isDrawing,
    isProcessing,
    inverted,
  ]);

  // Re-clear canvas when invert changes
  useEffect(() => {
    if (!isDrawing && !isProcessing) {
      clearCanvas();
      drawPreview();
    }
  }, [inverted]);

  // Scroll to video and auto-play when video is ready
  useEffect(() => {
    if (videoUrl && !isDrawing) {
      // Wait for the video section to render
      setTimeout(() => {
        videoSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
  }, [videoUrl, isDrawing]);

  const startDrawingAndRecording = async () => {
    if (imagePoints.length === 0) return;
    // Clean up any lingering animation/recording from previous mode
    if (animationRef.current)
      cancelAnimationFrame(animationRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
    }
    // Skip credit checks in mock mode
    if (API_MODE !== "mock") {
      if (!credits || credits.videoCredits < 1) {
        toast.error(
          "Not enough video credits! Buy more credits to continue.",
        );
        navigate("/pricing");
        return;
      }
      const result = await deductCredits("video");
      if (result.error) {
        toast.error(result.error);
        return;
      }
      await refreshProfile();
      toast.success("1 video credit used");
    } else {
      await deductCredits("video");
      toast.success("Video recording started (mock mode)");
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    setVideoUrl(null);
    clearCanvas();
    setIsDrawing(true);
    setIsRecording(true);
    chunksRef.current = [];
    stoppedEarlyRef.current = false;

    const stream = canvas.captureStream(30);
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeTypeRef.current,
      });
    } catch {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.onstop = () => {
      if (stoppedEarlyRef.current) {
        // Discard the incomplete video
        chunksRef.current = [];
        setIsRecording(false);
        return;
      }
      const blob = new Blob(chunksRef.current, {
        type: mimeTypeRef.current,
      });
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setIsRecording(false);
    };
    mediaRecorderRef.current.start();
    startLiveAudio();

    const ctx = canvas.getContext("2d")!;
    const points = imagePoints;
    let phase: "leadIn" | "draw" | "reverse" = "leadIn";
    let currentPoint = 0;
    let reversePoint = points.length - 1;
    let leadInFrames = 30; // 1 second at 30fps

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawFrame = () => {
      if (phase === "leadIn") {
        leadInFrames--;
        if (leadInFrames <= 0) {
          phase = "draw";
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
        }
        animationRef.current = requestAnimationFrame(drawFrame);
        return;
      }
      if (phase === "draw") {
        if (currentPoint >= points.length - 1) {
          ctx.stroke();
          if (reverseEnabled) {
            phase = "reverse";
            reversePoint = points.length - 1;
            animationRef.current =
              requestAnimationFrame(drawFrame);
            return;
          }
          setIsDrawing(false);
          stopLiveAudio();
          if (mediaRecorderRef.current?.state !== "inactive")
            mediaRecorderRef.current?.stop();
          return;
        }
        const batchSize = speed * 8;
        for (
          let i = 0;
          i < batchSize && currentPoint < points.length - 1;
          i++
        ) {
          currentPoint++;
          const dx =
            points[currentPoint].x - points[currentPoint - 1].x;
          const dy =
            points[currentPoint].y - points[currentPoint - 1].y;
          if (dx * dx + dy * dy > JUMP_THRESHOLD_SQ) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(
              points[currentPoint].x,
              points[currentPoint].y,
            );
          } else {
            ctx.lineTo(
              points[currentPoint].x,
              points[currentPoint].y,
            );
          }
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(
          points[currentPoint].x,
          points[currentPoint].y,
        );
      } else {
        if (reversePoint <= 0) {
          clearCanvas();
          setIsDrawing(false);
          stopLiveAudio();
          if (mediaRecorderRef.current?.state !== "inactive")
            mediaRecorderRef.current?.stop();
          return;
        }
        ctx.strokeStyle = inverted ? "#000000" : "#ffffff";
        ctx.lineWidth = lineWidth + 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const reverseBatch = speed * 8 * reverseSpeedMultiplier;
        ctx.beginPath();
        ctx.moveTo(
          points[reversePoint].x,
          points[reversePoint].y,
        );
        for (
          let i = 0;
          i < reverseBatch && reversePoint > 0;
          i++
        ) {
          reversePoint--;
          const dx =
            points[reversePoint].x - points[reversePoint + 1].x;
          const dy =
            points[reversePoint].y - points[reversePoint + 1].y;
          if (dx * dx + dy * dy > JUMP_THRESHOLD_SQ) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(
              points[reversePoint].x,
              points[reversePoint].y,
            );
          } else {
            ctx.lineTo(
              points[reversePoint].x,
              points[reversePoint].y,
            );
          }
        }
        ctx.stroke();
      }
      animationRef.current = requestAnimationFrame(drawFrame);
    };
    animationRef.current = requestAnimationFrame(drawFrame);
  };

  const stopEarly = () => {
    if (animationRef.current)
      cancelAnimationFrame(animationRef.current);
    stoppedEarlyRef.current = true;
    setIsDrawing(false);
    setStoryProgress("");
    stopLiveAudio();
    if (mediaRecorderRef.current?.state !== "inactive")
      mediaRecorderRef.current?.stop();
  };

  const downloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `one-line-art.${mimeTypeRef.current.includes("mp4") ? "mp4" : "webm"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Background audio management ──
  const handleBgAudioUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgAudioFile(file);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setBgAudioBuffer(decoded);
      ctx.close();
      toast.success(
        "Audio track loaded — it will play during recording",
      );
    } catch (err) {
      toast.error("Could not decode audio file");
      setBgAudioFile(null);
      setBgAudioBuffer(null);
    }
  };

  const removeBgAudio = () => {
    stopLiveAudio();
    setBgAudioFile(null);
    setBgAudioBuffer(null);
  };

  const startLiveAudio = () => {
    if (!bgAudioBuffer) return;
    try {
      const ctx = new AudioContext();
      liveAudioCtxRef.current = ctx;
      const source = ctx.createBufferSource();
      source.buffer = bgAudioBuffer;
      const gain = ctx.createGain();
      gain.gain.value = bgAudioVolume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      liveAudioSourceRef.current = source;
    } catch {}
  };

  const stopLiveAudio = () => {
    try {
      liveAudioSourceRef.current?.stop();
    } catch {}
    try {
      liveAudioCtxRef.current?.close();
    } catch {}
    liveAudioSourceRef.current = null;
    liveAudioCtxRef.current = null;
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (e.target.files?.[0]) setImageFile(e.target.files[0]);
  };

  const generateImage = async () => {
    if (!aiPrompt.trim()) return;

    // Parse prompt: only split for multi-image in story mode
    const rawPrompt = aiPrompt.trim();
    let prompts: string[];
    if (mode !== "story") {
      prompts = [rawPrompt];
    } else {
      const numberedMatch = rawPrompt.match(
        /(?:^|\s)\d+[\.\)]\s/g,
      );
      if (numberedMatch && numberedMatch.length >= 2) {
        prompts = rawPrompt
          .split(/\d+[\.\)]\s/)
          .filter((s) => s.trim().length > 0)
          .map((s) => s.trim());
      } else if (rawPrompt.includes(";")) {
        prompts = rawPrompt
          .split(";")
          .filter((s) => s.trim().length > 0)
          .map((s) => s.trim());
      } else {
        prompts = [rawPrompt];
      }
    }

    // Cap at 10 total images in story mode
    if (mode === "story") {
      const remaining = 10 - storyImages.length;
      if (remaining <= 0) {
        toast.error("Storyboard is full (10 images max)");
        return;
      }
      prompts = prompts.slice(0, remaining);
    }

    const totalImages = prompts.length;

    // Credit check for all images
    if (API_MODE !== "mock") {
      if (!credits || credits.imageCredits < totalImages) {
        toast.error(
          `Not enough image credits! Need ${totalImages}, have ${credits?.imageCredits ?? 0}.`,
        );
        navigate("/pricing");
        return;
      }
      for (let i = 0; i < totalImages; i++) {
        const result = await deductCredits("image");
        if (result.error) {
          toast.error(result.error);
          return;
        }
      }
      await refreshProfile();
      toast.success(
        `${totalImages} image credit${totalImages > 1 ? "s" : ""} used`,
      );
    } else {
      for (let i = 0; i < totalImages; i++)
        await deductCredits("image");
      if (totalImages > 1)
        toast.success(
          `Generating ${totalImages} images (mock mode)`,
        );
    }

    setIsGenerating(true);
    setAiError(null);
    setAiGeneratingCount(totalImages);

    const generateOne = async (
      prompt: string,
      index: number,
    ) => {
      try {
        const result = await generateAiImage(prompt);
        if (result.error) throw new Error(result.error);
        const b64 = result.b64_json;
        if (!b64) throw new Error("No image data returned");
        const byteString = atob(b64);
        const ab = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++)
          ab[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: "image/png" });
        const file = new File(
          [blob],
          `ai-generated-${index + 1}.png`,
          { type: "image/png" },
        );

        if (mode === "story") {
          await addStoryImage(file);
          toast.success(
            `AI image ${index + 1}/${totalImages} added to storyboard`,
          );
        } else {
          setImageFile(file);
        }
      } catch (error: any) {
        setAiError((prev) => {
          const msg = `Image ${index + 1}: ${error?.message || "Failed"}`;
          return prev ? `${prev}\n${msg}` : msg;
        });
      } finally {
        setAiGeneratingCount((prev) => prev - 1);
      }
    };

    // Fire all generations in parallel
    const tasks = prompts.map((p, i) => generateOne(p, i));
    await Promise.all(tasks);

    setIsGenerating(false);
    setAiGeneratingCount(0);
  };

  // Theme-aware classes
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
  const inputBgCls = inverted
    ? "bg-neutral-800/60 border-neutral-700 text-white placeholder:text-neutral-500"
    : "bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400";
  const sliderTrack = inverted
    ? "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
    : "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-neutral-200 accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg";
  const toggleBgCls = inverted
    ? "bg-white/10"
    : "bg-neutral-300";
  const uploadCls = inverted
    ? "border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20"
    : "border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-400";
  const uploadTextCls = inverted
    ? "text-neutral-400 group-hover:text-white"
    : "text-neutral-500 group-hover:text-neutral-900";
  const colorInputCls = inverted
    ? "bg-white/[0.05] border border-white/[0.08] text-white"
    : "bg-neutral-50 border border-neutral-200 text-neutral-900";
  const canvasWrapCls = inverted
    ? "bg-neutral-800/50 border-neutral-700"
    : "bg-neutral-100 border-neutral-200";
  const estCls = inverted
    ? "text-neutral-400 bg-white/[0.03] border border-white/[0.06]"
    : "text-neutral-500 bg-neutral-50 border border-neutral-200";
  const recordBtnCls = inverted
    ? "bg-white text-neutral-900 hover:bg-neutral-100"
    : "bg-neutral-900 text-white hover:bg-neutral-800";
  const clearBtnCls = inverted
    ? "bg-white/[0.05] hover:bg-white/[0.1] text-neutral-400 hover:text-white border border-white/[0.08]"
    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 border border-neutral-200";

  return (
    <div className="p-4 md:p-6 relative">
      {/* Background effects — always visible on dark app background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-indigo-500/[0.07] rounded-full blur-[150px]" />
        <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-violet-500/[0.05] rounded-full blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Mode Toggle */}
        <div
          className={`${panelCls} p-2 rounded-2xl mb-5 transition-colors duration-300 flex gap-1`}
        >
          <button
            onClick={() => {
              if (animationRef.current)
                cancelAnimationFrame(animationRef.current);
              setIsDrawing(false);
              setIsRecording(false);
              setStoryProgress("");
              setVideoUrl(null);
              setVideoBlob(null);
              setMode("single");
              setTimeout(() => {
                clearCanvas();
                drawPreview();
              }, 0);
            }}
            disabled={isDrawing}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              mode === "single"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : inverted
                  ? "text-neutral-400 hover:text-white hover:bg-white/5"
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Single Image
          </button>
          <button
            onClick={() => {
              if (animationRef.current)
                cancelAnimationFrame(animationRef.current);
              setIsDrawing(false);
              setIsRecording(false);
              setStoryProgress("");
              setVideoUrl(null);
              setVideoBlob(null);
              setMode("story");
              setTimeout(() => clearCanvas(), 0);
            }}
            disabled={isDrawing}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              mode === "story"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : inverted
                  ? "text-neutral-400 hover:text-white hover:bg-white/5"
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            <Film className="w-4 h-4" /> Story Mode
            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
              NEW
            </span>
          </button>
        </div>

        {/* AI Generation */}
        <div
          className={`${panelCls} p-5 rounded-2xl mb-5 transition-colors duration-300`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span
              className={`text-sm font-semibold ${textCls}`}
            >
              Generate with AI
            </span>
            {mode === "story" && (
              <span className={`text-xs ${mutedCls}`}>
                Images auto-add to storyboard
              </span>
            )}
            {credits && (
              <span className={`text-xs ${mutedCls} ml-auto`}>
                Costs 1 image credit each
              </span>
            )}
          </div>
          <div className="flex gap-3 items-end">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !isGenerating &&
                  aiPrompt.trim()
                ) {
                  e.preventDefault();
                  generateImage();
                }
              }}
              disabled={isGenerating || isDrawing}
              rows={1}
              className={`flex-1 px-4 py-3 ${inputBgCls} border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-40 transition-all resize-none overflow-hidden`}
              placeholder={
                mode === "story"
                  ? "Describe images separated by ; e.g. 'a sunrise; a mountain; a sunset'"
                  : "Describe what you want drawn, e.g. 'a cat sitting on a windowsill'"
              }
              style={{ minHeight: "44px", maxHeight: "160px" }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height =
                  Math.min(el.scrollHeight, 160) + "px";
              }}
            />
            <button
              onClick={generateImage}
              disabled={
                isGenerating || !aiPrompt.trim() || isDrawing
              }
              className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {aiGeneratingCount > 0
                    ? `${aiGeneratingCount} left...`
                    : "Generating..."}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
          {mode === "story" && (
            <p className={`text-xs ${mutedCls} mt-2`}>
              Tip: Separate multiple images with{" "}
              <strong>;</strong> or use a numbered list (1. 2.
              3.) to generate up to 10 images at once
            </p>
          )}
          {aiError && (
            <p className="text-sm text-red-400 mt-2 whitespace-pre-line">
              {aiError}
            </p>
          )}
        </div>

        {/* Canvas */}
        <div
          className={`relative p-2 rounded-2xl border mb-5 transition-colors duration-300 ${canvasWrapCls}`}
        >
          {isProcessing && (
            <div className="absolute inset-0 z-10 bg-neutral-950/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
              <p className="text-sm font-medium text-neutral-300">
                Calculating continuous path...
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                This may take a moment for complex images
              </p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className={`w-full rounded-xl transition-colors ${inverted ? "bg-black" : "bg-white"}`}
            style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
          />
          {isRecording && (
            <div className="absolute top-5 right-5 flex items-center gap-2 bg-red-500/90 backdrop-blur text-white px-3.5 py-2 rounded-full text-sm font-medium animate-pulse z-20 shadow-lg shadow-red-500/30">
              <div className="w-2 h-2 rounded-full bg-white" />{" "}
              Recording...
            </div>
          )}
          {storyProgress && isRecording && (
            <div className="absolute top-5 left-5 bg-black/70 backdrop-blur text-white px-3.5 py-2 rounded-full text-sm font-medium z-20">
              {storyProgress}
            </div>
          )}
        </div>

        {/* Controls — Single Mode */}
        {mode === "single" && (
          <div
            className={`${panelCls} rounded-2xl p-5 mb-5 transition-colors duration-300`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* ── Col 1: Image Source + Trace Quality ── */}
              <div className="space-y-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Image Source
                </p>
                <label
                  className={`flex items-center gap-3 w-full px-3 py-3 border rounded-xl cursor-pointer transition-all group ${uploadCls}`}
                >
                  <UploadCloud className="w-5 h-5 text-neutral-500 group-hover:text-indigo-400 transition-colors shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate transition-colors ${uploadTextCls}`}
                    >
                      {imageFile
                        ? imageFile.name
                        : "Click to upload image"}
                    </p>
                    {!imageFile && (
                      <p
                        className={`text-xs ${inverted ? "text-neutral-600" : "text-neutral-400"}`}
                      >
                        PNG, JPG, SVG or GIF
                      </p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={isDrawing || isProcessing}
                  />
                </label>
                {imagePoints.length > 0 && (
                  <p
                    className={`text-xs ${mutedCls} flex items-center gap-1.5`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {imagePoints.length.toLocaleString()} points
                    traced
                  </p>
                )}
                <div
                  className={`border-t ${inverted ? "border-white/[0.06]" : "border-neutral-100"} pt-3`}
                >
                  <p
                    className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls} mb-3`}
                  >
                    Trace Quality
                  </p>
                  <div className="flex justify-between mb-1.5">
                    <label
                      className={`text-xs font-medium ${labelCls}`}
                    >
                      Point Density
                    </label>
                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded">
                      {(pointDensity / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100000"
                    max="500000"
                    step="50000"
                    value={pointDensity}
                    onChange={(e) =>
                      setPointDensity(Number(e.target.value))
                    }
                    disabled={
                      isDrawing || isProcessing || !imageFile
                    }
                    className={sliderTrack}
                  />
                  <p className={`text-[10px] ${mutedCls} mt-1`}>
                    Higher = more detail, slower to process
                  </p>
                </div>
              </div>

              {/* ── Col 2: Style + Animation ── */}
              <div className="space-y-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Style
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className={`text-xs font-medium ${labelCls} block mb-1.5`}
                    >
                      Stroke Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) =>
                          setColor(e.target.value)
                        }
                        disabled={isDrawing}
                        className={`w-8 h-8 rounded-lg cursor-pointer p-0.5 shrink-0 disabled:opacity-30 ${inverted ? "border border-white/10 bg-white/5" : "border border-neutral-200 bg-neutral-50"}`}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => {
                          if (
                            /^#[0-9a-fA-F]{0,6}$/.test(
                              e.target.value,
                            )
                          )
                            setColor(e.target.value);
                        }}
                        disabled={isDrawing}
                        className={`w-full px-2 py-1.5 rounded-lg text-xs font-mono uppercase disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${colorInputCls}`}
                        maxLength={7}
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label
                        className={`text-xs font-medium ${labelCls}`}
                      >
                        Thickness
                      </label>
                      <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                        {lineWidth}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={Math.round(lineWidth * 10)}
                      onChange={(e) =>
                        setLineWidth(
                          Number(e.target.value) / 10,
                        )
                      }
                      disabled={isDrawing}
                      className={sliderTrack}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={inverted}
                      onChange={toggleInvert}
                      disabled={isDrawing}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5.5 ${toggleBgCls} peer-checked:bg-indigo-600 rounded-full transition-colors peer-disabled:opacity-30`}
                    />
                    <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-lg transition-transform peer-checked:translate-x-[18px]" />
                  </div>
                  <SunMoon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span
                    className={`text-xs font-medium ${labelCls}`}
                  >
                    Dark canvas
                  </span>
                </label>

                <div
                  className={`border-t ${inverted ? "border-white/[0.06]" : "border-neutral-100"} pt-3`}
                >
                  <p
                    className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls} mb-3`}
                  >
                    Animation
                  </p>
                  <div className="flex justify-between mb-1.5">
                    <label
                      className={`text-xs font-medium ${labelCls}`}
                    >
                      Draw Speed
                    </label>
                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {speed}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={speed}
                    onChange={(e) =>
                      setSpeed(Number(e.target.value))
                    }
                    disabled={isDrawing}
                    className={sliderTrack}
                  />
                  <label className="flex items-center gap-2.5 cursor-pointer select-none mt-3 group">
                    <div className="relative shrink-0">
                      <input
                        type="checkbox"
                        checked={reverseEnabled}
                        onChange={(e) =>
                          setReverseEnabled(e.target.checked)
                        }
                        disabled={isDrawing}
                        className="sr-only peer"
                      />
                      <div
                        className={`w-10 h-5.5 ${toggleBgCls} peer-checked:bg-indigo-600 rounded-full transition-colors peer-disabled:opacity-30`}
                      />
                      <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-lg transition-transform peer-checked:translate-x-[18px]" />
                    </div>
                    <Undo2
                      className={`w-3.5 h-3.5 ${mutedCls} shrink-0`}
                    />
                    <span
                      className={`text-xs font-medium ${labelCls}`}
                    >
                      Reverse after draw
                    </span>
                  </label>
                  {reverseEnabled && (
                    <div className="mt-3">
                      <div className="flex justify-between mb-1.5">
                        <label
                          className={`text-xs font-medium ${labelCls}`}
                        >
                          Erase Speed
                        </label>
                        <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                          {reverseSpeedMultiplier}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={reverseSpeedMultiplier}
                        onChange={(e) =>
                          setReverseSpeedMultiplier(
                            Number(e.target.value),
                          )
                        }
                        disabled={isDrawing}
                        className={sliderTrack}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ── Col 3: Audio + Record ── */}
              <div className="flex flex-col gap-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Audio
                </p>
                <div
                  className={`rounded-xl px-3 py-2.5 ${inverted ? "bg-white/[0.03] border border-white/[0.06]" : "bg-neutral-50 border border-neutral-200"}`}
                >
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    {bgAudioFile ? (
                      <>
                        <span
                          className={`text-xs ${labelCls} truncate flex-1`}
                        >
                          {bgAudioFile.name}
                        </span>
                        <button
                          onClick={removeBgAudio}
                          disabled={isDrawing}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <label
                        className={`text-xs ${mutedCls} cursor-pointer hover:text-purple-400 transition-colors flex-1`}
                      >
                        Add background audio...
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleBgAudioUpload}
                          className="hidden"
                          disabled={isDrawing}
                        />
                      </label>
                    )}
                  </div>
                  {bgAudioFile && (
                    <div className="flex items-center gap-2 mt-2">
                      <Volume2 className="w-3 h-3 text-purple-400 shrink-0" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={bgAudioVolume}
                        onChange={(e) =>
                          setBgAudioVolume(
                            Number(e.target.value),
                          )
                        }
                        disabled={isDrawing}
                        className={`flex-1 h-1 rounded-full appearance-none cursor-pointer ${inverted ? "bg-white/10" : "bg-neutral-200"} accent-purple-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:appearance-none`}
                      />
                      <span
                        className={`text-[10px] ${mutedCls} w-8 text-right`}
                      >
                        {Math.round(bgAudioVolume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                {estimatedDuration &&
                  imagePoints.length > 0 && (
                    <div
                      className={`flex items-center gap-2 text-xs ${estCls} rounded-lg px-3 py-2`}
                    >
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      Est. video length:{" "}
                      <span
                        className={`font-semibold ${textCls} ml-1`}
                      >
                        {estimatedDuration}
                      </span>
                    </div>
                  )}
                {bgAudioBuffer &&
                  estimatedRawSeconds > 0 &&
                  (() => {
                    const audioDur = bgAudioBuffer.duration;
                    const vidDur = estimatedRawSeconds;
                    const diff = Math.abs(audioDur - vidDur);
                    const ratio =
                      diff / Math.max(audioDur, vidDur);
                    const matched = ratio < 0.1;
                    const cls = matched
                      ? inverted
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : inverted
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        : "bg-amber-50 border-amber-200 text-amber-700";
                    return (
                      <div
                        className={`rounded-lg px-3 py-2 text-xs border ${cls}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <Music className="w-3 h-3" /> Audio
                          </span>
                          <span className="font-mono font-semibold">
                            {fmtSec(audioDur)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Video
                          </span>
                          <span className="font-mono font-semibold">
                            {fmtSec(vidDur)}
                          </span>
                        </div>
                        {matched ? (
                          <div className="text-[10px] mt-0.5 opacity-80">
                            Lengths match — great!
                          </div>
                        ) : (
                          <div className="text-[10px] mt-0.5 opacity-80">
                            {audioDur > vidDur
                              ? `Video ~${fmtSec(audioDur - vidDur)} shorter — lower Draw Speed`
                              : `Video ~${fmtSec(vidDur - audioDur)} longer — raise Draw Speed`}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                <div className="flex-1" />

                <div
                  className={`border-t ${inverted ? "border-white/[0.06]" : "border-neutral-100"} pt-3`}
                >
                  <div className="flex gap-2">
                    {!isDrawing ? (
                      <button
                        onClick={startDrawingAndRecording}
                        disabled={
                          isProcessing ||
                          !imageFile ||
                          imagePoints.length === 0
                        }
                        className={`flex-1 py-3 px-3 ${recordBtnCls} rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-30 disabled:cursor-not-allowed text-sm`}
                      >
                        <Video className="w-4 h-4 text-red-500" />{" "}
                        Record
                        {credits && (
                          <span className="text-xs opacity-50">
                            (1 credit)
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={stopEarly}
                        className="flex-1 py-3 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Square className="w-4 h-4 fill-current" />{" "}
                        Stop
                      </button>
                    )}
                    <button
                      onClick={clearCanvas}
                      disabled={isDrawing || isProcessing}
                      className={`py-3 px-3 ${clearBtnCls} rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30 text-sm`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls — Story Mode */}
        {mode === "story" && (
          <div
            className={`${panelCls} rounded-2xl p-6 mb-5 transition-colors duration-300`}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-violet-500/20 rounded-lg flex items-center justify-center">
                <Film className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span
                className={`text-sm font-semibold ${textCls}`}
              >
                Story Sequence
              </span>
              <span className={`text-xs ${mutedCls}`}>
                ({storyImages.length}/10 images)
              </span>
              {storyProgress && (
                <span className="ml-auto text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full font-medium animate-pulse">
                  {storyProgress}
                </span>
              )}
            </div>

            {/* Image thumbnails */}
            <div className="flex flex-wrap gap-3 mb-5">
              {storyImages.map((si, idx) => (
                <div
                  key={si.id}
                  className={`relative group w-24 h-24 rounded-xl overflow-hidden border-2 transition-all ${
                    si.processing
                      ? "border-amber-500/50"
                      : si.points.length > 0
                        ? "border-emerald-500/50"
                        : "border-red-500/50"
                  } ${inverted ? "bg-neutral-800" : "bg-neutral-100"}`}
                >
                  <img
                    src={si.thumbUrl}
                    alt={`Story ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {si.processing && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    </div>
                  )}
                  <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[10px] font-bold w-5 h-5 rounded-md flex items-center justify-center">
                    {idx + 1}
                  </div>
                  {!isDrawing && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                      {idx > 0 && (
                        <button
                          onClick={() =>
                            moveStoryImage(idx, -1)
                          }
                          className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center text-white text-xs"
                        >
                          &larr;
                        </button>
                      )}
                      <button
                        onClick={() => removeStoryImage(si.id)}
                        className="w-6 h-6 rounded bg-red-500/60 hover:bg-red-500/80 flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                      {idx < storyImages.length - 1 && (
                        <button
                          onClick={() => moveStoryImage(idx, 1)}
                          className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center text-white text-xs"
                        >
                          &rarr;
                        </button>
                      )}
                    </div>
                  )}
                  {!si.processing && si.points.length > 0 && (
                    <div className="absolute bottom-0.5 right-0.5 bg-emerald-500/80 rounded px-1 py-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {storyImages.length < 10 && !isDrawing && (
                <label
                  className={`w-24 h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${uploadCls}`}
                >
                  <Plus className="w-5 h-5 text-indigo-400 mb-0.5" />
                  <span
                    className={`text-[10px] font-medium ${mutedCls}`}
                  >
                    Add Image
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleStoryUpload}
                  />
                </label>
              )}
            </div>

            {/* Story Settings — 3 logical columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* ── Col 1: Sequence Timing ── */}
              <div className="space-y-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Sequence
                </p>
                <div>
                  <div className="flex justify-between mb-1.5">
                    <label
                      className={`text-xs font-medium ${labelCls}`}
                    >
                      Pause Between Images
                    </label>
                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded">
                      {storyWaitTime}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={storyWaitTime}
                    onChange={(e) =>
                      setStoryWaitTime(Number(e.target.value))
                    }
                    disabled={isDrawing}
                    className={sliderTrack}
                  />
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none mt-1 group">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={storyReverse}
                      onChange={(e) =>
                        setStoryReverse(e.target.checked)
                      }
                      disabled={isDrawing}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5.5 ${toggleBgCls} peer-checked:bg-indigo-600 rounded-full transition-colors peer-disabled:opacity-30`}
                    />
                    <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-lg transition-transform peer-checked:translate-x-[18px]" />
                  </div>
                  <Undo2
                    className={`w-3.5 h-3.5 ${mutedCls} shrink-0`}
                  />
                  <span
                    className={`text-xs font-medium ${labelCls}`}
                  >
                    Erase before next image
                  </span>
                </label>
                {storyReverse && (
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label
                        className={`text-xs font-medium ${labelCls}`}
                      >
                        Erase Speed
                      </label>
                      <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                        {reverseSpeedMultiplier}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={reverseSpeedMultiplier}
                      onChange={(e) =>
                        setReverseSpeedMultiplier(
                          Number(e.target.value),
                        )
                      }
                      disabled={isDrawing}
                      className={sliderTrack}
                    />
                  </div>
                )}
              </div>

              {/* ── Col 2: Style + Animation ── */}
              <div className="space-y-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Style
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className={`text-xs font-medium ${labelCls} block mb-1.5`}
                    >
                      Stroke Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) =>
                          setColor(e.target.value)
                        }
                        disabled={isDrawing}
                        className={`w-8 h-8 rounded-lg cursor-pointer p-0.5 shrink-0 disabled:opacity-30 ${inverted ? "border border-white/10 bg-white/5" : "border border-neutral-200 bg-neutral-50"}`}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => {
                          if (
                            /^#[0-9a-fA-F]{0,6}$/.test(
                              e.target.value,
                            )
                          )
                            setColor(e.target.value);
                        }}
                        disabled={isDrawing}
                        className={`w-full px-2 py-1.5 rounded-lg text-xs font-mono uppercase disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${colorInputCls}`}
                        maxLength={7}
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label
                        className={`text-xs font-medium ${labelCls}`}
                      >
                        Thickness
                      </label>
                      <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                        {lineWidth}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={Math.round(lineWidth * 10)}
                      onChange={(e) =>
                        setLineWidth(
                          Number(e.target.value) / 10,
                        )
                      }
                      disabled={isDrawing}
                      className={sliderTrack}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={inverted}
                      onChange={toggleInvert}
                      disabled={isDrawing}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5.5 ${toggleBgCls} peer-checked:bg-indigo-600 rounded-full transition-colors peer-disabled:opacity-30`}
                    />
                    <div className="absolute left-0.5 top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-lg transition-transform peer-checked:translate-x-[18px]" />
                  </div>
                  <SunMoon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span
                    className={`text-xs font-medium ${labelCls}`}
                  >
                    Dark canvas
                  </span>
                </label>

                <div
                  className={`border-t ${inverted ? "border-white/[0.06]" : "border-neutral-100"} pt-3`}
                >
                  <p
                    className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls} mb-3`}
                  >
                    Animation
                  </p>
                  <div className="flex justify-between mb-1.5">
                    <label
                      className={`text-xs font-medium ${labelCls}`}
                    >
                      Draw Speed
                    </label>
                    <span className="text-xs text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      {speed}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={speed}
                    onChange={(e) =>
                      setSpeed(Number(e.target.value))
                    }
                    disabled={isDrawing}
                    className={sliderTrack}
                  />
                </div>
              </div>

              {/* ── Col 3: Audio + Record ── */}
              <div className="flex flex-col gap-3">
                <p
                  className={`text-[10px] font-bold tracking-widest uppercase ${mutedCls}`}
                >
                  Audio
                </p>
                <div
                  className={`rounded-xl px-3 py-2.5 ${inverted ? "bg-white/[0.03] border border-white/[0.06]" : "bg-neutral-50 border border-neutral-200"}`}
                >
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    {bgAudioFile ? (
                      <>
                        <span
                          className={`text-xs ${labelCls} truncate flex-1`}
                        >
                          {bgAudioFile.name}
                        </span>
                        <button
                          onClick={removeBgAudio}
                          disabled={isDrawing}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <label
                        className={`text-xs ${mutedCls} cursor-pointer hover:text-purple-400 transition-colors flex-1`}
                      >
                        Add background audio...
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleBgAudioUpload}
                          className="hidden"
                          disabled={isDrawing}
                        />
                      </label>
                    )}
                  </div>
                  {bgAudioFile && (
                    <div className="flex items-center gap-2 mt-2">
                      <Volume2 className="w-3 h-3 text-purple-400 shrink-0" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={bgAudioVolume}
                        onChange={(e) =>
                          setBgAudioVolume(
                            Number(e.target.value),
                          )
                        }
                        disabled={isDrawing}
                        className={`flex-1 h-1 rounded-full appearance-none cursor-pointer ${inverted ? "bg-white/10" : "bg-neutral-200"} accent-purple-500 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:appearance-none`}
                      />
                      <span
                        className={`text-[10px] ${mutedCls} w-8 text-right`}
                      >
                        {Math.round(bgAudioVolume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                {storyEstimatedDuration && (
                  <div
                    className={`flex items-center gap-2 text-xs ${estCls} rounded-lg px-3 py-2`}
                  >
                    <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    Est. total:{" "}
                    <span
                      className={`font-semibold ${textCls} ml-1`}
                    >
                      {storyEstimatedDuration}
                    </span>
                  </div>
                )}
                {bgAudioBuffer &&
                  storyEstimatedRawSeconds > 0 &&
                  (() => {
                    const audioDur = bgAudioBuffer.duration;
                    const vidDur = storyEstimatedRawSeconds;
                    const diff = Math.abs(audioDur - vidDur);
                    const ratio =
                      diff / Math.max(audioDur, vidDur);
                    const matched = ratio < 0.1;
                    const cls = matched
                      ? inverted
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : inverted
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        : "bg-amber-50 border-amber-200 text-amber-700";
                    return (
                      <div
                        className={`rounded-lg px-3 py-2 text-xs border ${cls}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <Music className="w-3 h-3" /> Audio
                          </span>
                          <span className="font-mono font-semibold">
                            {fmtSec(audioDur)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Video
                          </span>
                          <span className="font-mono font-semibold">
                            {fmtSec(vidDur)}
                          </span>
                        </div>
                        {matched ? (
                          <div className="text-[10px] mt-0.5 opacity-80">
                            Lengths match — great!
                          </div>
                        ) : (
                          <div className="text-[10px] mt-0.5 opacity-80">
                            {audioDur > vidDur
                              ? `Video ~${fmtSec(audioDur - vidDur)} shorter — lower Draw Speed`
                              : `Video ~${fmtSec(vidDur - audioDur)} longer — raise Draw Speed`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                {storyImages.length > 0 && (
                  <div
                    className={`flex items-center gap-2 text-xs ${estCls} rounded-lg px-3 py-2`}
                  >
                    <Video className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    Cost:{" "}
                    <span
                      className={`font-semibold ${textCls} ml-1`}
                    >
                      {storyImages.length} video credit
                      {storyImages.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                <div className="flex-1" />

                <div
                  className={`border-t ${inverted ? "border-white/[0.06]" : "border-neutral-100"} pt-3`}
                >
                  <div className="flex gap-2">
                    {!isDrawing ? (
                      <button
                        onClick={startStoryRecording}
                        disabled={
                          storyImages.filter(
                            (si) =>
                              si.points.length > 0 &&
                              !si.processing,
                          ).length === 0
                        }
                        className={`flex-1 py-3 px-3 ${recordBtnCls} rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-30 disabled:cursor-not-allowed text-sm`}
                      >
                        <Film className="w-4 h-4 text-red-500" />{" "}
                        Record Story
                      </button>
                    ) : (
                      <button
                        onClick={stopEarly}
                        className="flex-1 py-3 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Square className="w-4 h-4 fill-current" />{" "}
                        Stop
                      </button>
                    )}
                    <button
                      onClick={clearCanvas}
                      disabled={isDrawing}
                      className={`py-3 px-3 ${clearBtnCls} rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30 text-sm`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Output */}
        {videoUrl && !isDrawing && (
          <div ref={videoSectionRef}>
            <AudioEditor
              videoUrl={videoUrl}
              videoBlob={videoBlob!}
              mimeType={mimeTypeRef.current}
              inverted={inverted}
              canvasW={CANVAS_W}
              canvasH={CANVAS_H}
              initialAudioFile={bgAudioFile}
              initialAudioBuffer={bgAudioBuffer}
              initialVolume={bgAudioVolume}
              onDownloadVideoOnly={downloadVideo}
            />
          </div>
        )}
      </div>
    </div>
  );
}