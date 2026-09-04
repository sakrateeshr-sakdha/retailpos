import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  X,
  Camera,
  Zap,
  ZapOff,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Focus,
  Maximize2,
  CheckCircle2,
} from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [manualCode, setManualCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // GPay-style Auto-Zoom & Snap States
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const [isAutoZooming, setIsAutoZooming] = useState(false);
  const [isCaptured, setIsCaptured] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(2.0);
  const [hardwareZoomSupported, setHardwareZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number }>({ min: 1, max: 4 });

  // Barcode tracking bounding box (GPay reticle snap)
  const [trackedBox, setTrackedBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);

  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanActiveRef = useRef<boolean>(false);
  const lastScannedTimeRef = useRef<number>(0);
  const currentZoomRef = useRef<number>(2.0);
  const autoZoomRampingRef = useRef<boolean>(false);
  const candidateFramesCountRef = useRef<number>(0);

  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1250, ctx.currentTime);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {}
  };

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([35, 40, 50]);
      } catch {}
    }
  };

  const applyZoom = async (targetZoom: number) => {
    const clamped = Math.max(zoomRange.min, Math.min(targetZoom, zoomRange.max));
    currentZoomRef.current = clamped;
    setCurrentZoom(clamped);

    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
          if (capabilities.zoom) {
            await videoTrack.applyConstraints({
              advanced: [{ zoom: clamped } as any],
            });
          }
        } catch (e) {
          console.warn('Hardware zoom not accepted:', e);
        }
      }
    }
  };

  // Trigger GPay-style auto-zoom when a candidate barcode is in view
  const triggerAutoZoomRamp = (target = 3.2) => {
    if (!autoZoomEnabled || autoZoomRampingRef.current) return;
    if (currentZoomRef.current >= target - 0.2) return;

    autoZoomRampingRef.current = true;
    setIsAutoZooming(true);

    const startZ = currentZoomRef.current;
    const endZ = target;
    const duration = 250;
    const startTime = performance.now();

    const animateZoom = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smooth easeOutQuad
      const eased = 1 - (1 - progress) * (1 - progress);
      const newZ = startZ + (endZ - startZ) * eased;

      applyZoom(newZ);

      if (progress < 1) {
        requestAnimationFrame(animateZoom);
      } else {
        autoZoomRampingRef.current = false;
        setTimeout(() => setIsAutoZooming(false), 500);
      }
    };

    requestAnimationFrame(animateZoom);
  };

  // Check if a candidate 1D barcode pattern is in the center area
  const detectBarcodeCandidate = (data: Uint8ClampedArray, width: number, height: number): boolean => {
    const lineY = [Math.floor(height * 0.35), Math.floor(height * 0.5), Math.floor(height * 0.65)];
    let maxTransitions = 0;

    for (const y of lineY) {
      const rowStart = y * width * 4;
      let transitions = 0;
      let lastIsDark = false;

      for (let x = 0; x < width; x += 2) {
        const idx = rowStart + (x * 4);
        const lum = (data[idx] * 38 + data[idx + 1] * 75 + data[idx + 2] * 15) >> 7;
        const isDark = lum < 115;

        if (x === 0) {
          lastIsDark = isDark;
        } else if (isDark !== lastIsDark) {
          transitions++;
          lastIsDark = isDark;
        }
      }
      if (transitions > maxTransitions) {
        maxTransitions = transitions;
      }
    }
    return maxTransitions >= 16;
  };

  const handleBarcodeFound = (code: string, boundingBox?: DOMRectReadOnly) => {
    if (!code) return;
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const now = Date.now();
    if (now - lastScannedTimeRef.current < 1500) return;
    lastScannedTimeRef.current = now;

    playBeep();
    triggerHaptic();
    setIsCaptured(cleanCode);

    if (boundingBox) {
      setTrackedBox({
        x: boundingBox.x,
        y: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
      });
    }

    // Auto-zoom snap before finishing
    triggerAutoZoomRamp(3.2);

    setTimeout(() => {
      onScan(cleanCode);
      onClose();
    }, 280);
  };

  // Linear contrast stretch & glare suppression for curved glossy packages
  const enhanceContrastAndSuppressGlare = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;

      let min = 255;
      let max = 0;
      const step = 8;
      for (let i = 0; i < d.length; i += step * 4) {
        const l = (d[i] * 38 + d[i + 1] * 75 + d[i + 2] * 15) >> 7;
        if (l < min) min = l;
        if (l > max) max = l;
      }

      const range = max - min;
      if (range > 25 && range < 235) {
        const scale = 255 / range;
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] * 38 + d[i + 1] * 75 + d[i + 2] * 15) >> 7;
          const v = Math.min(255, Math.max(0, (l - min) * scale));
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
      }
    } catch {}
  };

  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setFocusRing({ x, y });
    setTimeout(() => setFocusRing(null), 800);

    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as any],
          });
        } catch {}
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg(null);
    setIsCaptured(null);
    setTrackedBox(null);
    candidateFramesCountRef.current = 0;
    let isCancelled = false;

    // Prioritize retail 1D barcodes
    const hints = new Map();
    const formats = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.QR_CODE,
    ];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const codeReader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 45,
    });

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
    };

    navigator.mediaDevices
      ?.getUserMedia(constraints)
      .then(async (stream) => {
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};

          if (capabilities.torch) {
            setTorchAvailable(true);
          }

          if (capabilities.zoom) {
            setHardwareZoomSupported(true);
            const minZ = capabilities.zoom.min || 1;
            const maxZ = capabilities.zoom.max || 5;
            setZoomRange({ min: minZ, max: maxZ });
            const initialZoom = Math.max(minZ, Math.min(2.0, maxZ));
            currentZoomRef.current = initialZoom;
            setCurrentZoom(initialZoom);
            try {
              await videoTrack.applyConstraints({
                advanced: [{ zoom: initialZoom, focusMode: 'continuous' } as any],
              });
            } catch {}
          } else {
            currentZoomRef.current = 1.8;
            setCurrentZoom(1.8);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});

          const CROP_W = 640;
          const CROP_H = 360;

          if (cropCanvasRef.current) {
            cropCanvasRef.current.width = CROP_W;
            cropCanvasRef.current.height = CROP_H;
          }
          if (filterCanvasRef.current) {
            filterCanvasRef.current.width = CROP_W;
            filterCanvasRef.current.height = CROP_H;
          }
          if (rotatedCanvasRef.current) {
            rotatedCanvasRef.current.width = CROP_H;
            rotatedCanvasRef.current.height = CROP_W;
          }

          // Native Android BarcodeDetector Check
          if ('BarcodeDetector' in window) {
            try {
              const supported = await (window as any).BarcodeDetector.getSupportedFormats();
              const desired = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'].filter(
                (f) => supported.includes(f)
              );

              if (desired.length > 0) {
                const detector = new (window as any).BarcodeDetector({ formats: desired });
                scanActiveRef.current = true;

                let lastFrameTime = 0;

                const scanLoop = async (now: number) => {
                  if (!scanActiveRef.current || isCancelled || !videoRef.current) return;

                  if (now - lastFrameTime > 40) {
                    lastFrameTime = now;
                    try {
                      const video = videoRef.current;
                      if (video.readyState >= 2) {
                        // Pass 1: Direct Video Frame Detect
                        const directResults = await detector.detect(video);
                        if (directResults.length > 0 && directResults[0].rawValue) {
                          scanActiveRef.current = false;
                          handleBarcodeFound(directResults[0].rawValue, directResults[0].boundingBox);
                          return;
                        }

                        // Pass 2: Center Region of Interest (ROI)
                        const cropCanvas = cropCanvasRef.current;
                        const filterCanvas = filterCanvasRef.current;
                        if (cropCanvas && filterCanvas) {
                          const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
                          const filterCtx = filterCanvas.getContext('2d', { willReadFrequently: true });

                          if (cropCtx && filterCtx) {
                            const vw = video.videoWidth;
                            const vh = video.videoHeight;
                            const sx = (vw - CROP_W) / 2;
                            const sy = (vh - CROP_H) / 2;

                            cropCtx.drawImage(video, sx, sy, CROP_W, CROP_H, 0, 0, CROP_W, CROP_H);

                            // Detect on center crop
                            const cropResults = await detector.detect(cropCanvas);
                            if (cropResults.length > 0 && cropResults[0].rawValue) {
                              scanActiveRef.current = false;
                              handleBarcodeFound(cropResults[0].rawValue, cropResults[0].boundingBox);
                              return;
                            }

                            // Pass 3: Check candidate pattern & trigger GPay Auto-Zoom
                            const imgData = cropCtx.getImageData(0, 0, CROP_W, CROP_H);
                            const hasCandidate = detectBarcodeCandidate(imgData.data, CROP_W, CROP_H);

                            if (hasCandidate) {
                              candidateFramesCountRef.current++;
                              if (candidateFramesCountRef.current >= 2) {
                                triggerAutoZoomRamp(3.2); // GPay-style auto-zoom!
                              }
                            } else {
                              candidateFramesCountRef.current = Math.max(0, candidateFramesCountRef.current - 1);
                            }

                            // Pass 4: Glare suppression & contrast filter
                            filterCtx.drawImage(cropCanvas, 0, 0);
                            enhanceContrastAndSuppressGlare(filterCtx, CROP_W, CROP_H);

                            const filteredResults = await detector.detect(filterCanvas);
                            if (filteredResults.length > 0 && filteredResults[0].rawValue) {
                              scanActiveRef.current = false;
                              handleBarcodeFound(filteredResults[0].rawValue, filteredResults[0].boundingBox);
                              return;
                            }

                            // Pass 5: 90-degree rotated pass for cylindrical products (Lip Balm, Vicks)
                            const rotCanvas = rotatedCanvasRef.current;
                            if (rotCanvas) {
                              const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
                              if (rotCtx) {
                                rotCtx.save();
                                rotCtx.translate(CROP_H / 2, CROP_W / 2);
                                rotCtx.rotate(Math.PI / 2);
                                rotCtx.drawImage(filterCanvas, -CROP_W / 2, -CROP_H / 2);
                                rotCtx.restore();

                                const rotResults = await detector.detect(rotCanvas);
                                if (rotResults.length > 0 && rotResults[0].rawValue) {
                                  scanActiveRef.current = false;
                                  handleBarcodeFound(rotResults[0].rawValue, rotResults[0].boundingBox);
                                  return;
                                }
                              }
                            }
                          }
                        }
                      }
                    } catch (e) {}
                  }

                  if (scanActiveRef.current && !isCancelled) {
                    requestAnimationFrame(scanLoop);
                  }
                };

                requestAnimationFrame(scanLoop);
                return;
              }
            } catch {}
          }

          // Fallback ZXing reader
          try {
            const controls = await codeReader.decodeFromStream(
              stream,
              videoRef.current,
              (result) => {
                if (result && !isCancelled) {
                  controls.stop();
                  handleBarcodeFound(result.getText());
                }
              }
            );
            controlsRef.current = controls;
          } catch (readerErr: any) {
            console.warn('ZXing stream reader error:', readerErr);
          }
        }
      })
      .catch((err) => {
        console.warn('Camera stream error:', err);
        setErrorMsg('Camera access unavailable. You can enter or paste the barcode manually below.');
      });

    return () => {
      isCancelled = true;
      scanActiveRef.current = false;
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {}
        controlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Could not toggle flashlight:', err);
      }
    }
  };

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleBarcodeFound(manualCode.trim());
      setManualCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between max-w-lg mx-auto select-none overflow-hidden">
      <canvas ref={cropCanvasRef} className="hidden" />
      <canvas ref={filterCanvasRef} className="hidden" />
      <canvas ref={rotatedCanvasRef} className="hidden" />

      {/* Top Header Bar */}
      <div className="p-3.5 flex items-center justify-between text-white border-b border-gray-800 bg-gray-900/90 z-10">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm block leading-none">GPay-Style Smart Scanner</span>
            <span className="text-[10px] text-green-300">Auto-zooms & snaps small barcodes</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-full border transition ${
                torchOn ? 'bg-amber-500 border-amber-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'
              }`}
              title="Toggle Flashlight"
            >
              {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Auto-Zoom Indicator Banner */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 py-1.5 flex items-center justify-between z-10">
        <button
          onClick={() => setAutoZoomEnabled(!autoZoomEnabled)}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold transition active:scale-95 ${
            autoZoomEnabled ? 'bg-green-600 text-white shadow-xs' : 'bg-gray-800 text-gray-400'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Auto-Zoom: {autoZoomEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <div className="flex items-center space-x-1">
          {isAutoZooming && (
            <span className="text-[10px] bg-amber-500 text-black font-extrabold px-2 py-0.5 rounded-full animate-pulse">
              🔍 Auto-Zooming...
            </span>
          )}
          <span className="text-xs text-green-400 font-mono font-bold">
            {currentZoom.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Video Viewport with GPay Reticle Snap Animation */}
      <div
        onClick={handleTapToFocus}
        className="relative flex-1 flex items-center justify-center overflow-hidden px-3 py-2 cursor-crosshair"
      >
        <div className="w-full h-84 relative overflow-hidden rounded-3xl border-2 border-green-500 shadow-2xl bg-black">
          <video
            ref={videoRef}
            style={{
              transform: hardwareZoomSupported ? 'none' : `scale(${currentZoom})`,
              transformOrigin: 'center center',
            }}
            className="w-full h-full object-cover transition-transform duration-200"
            playsInline
            muted
          />

          {/* Tap-to-Focus Ring */}
          {focusRing && (
            <div
              style={{ left: focusRing.x - 24, top: focusRing.y - 24 }}
              className="absolute pointer-events-none w-12 h-12 border-2 border-yellow-400 rounded-full animate-ping shadow-[0_0_12px_rgba(250,204,21,1)]"
            />
          )}

          {/* GPay-Style Animated Target Reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-3">
            <div
              className={`border-2 transition-all duration-200 rounded-2xl flex flex-col justify-between p-2 shadow-inner ${
                isCaptured
                  ? 'w-64 h-32 border-green-400 bg-green-500/20 scale-105'
                  : isAutoZooming
                  ? 'w-64 h-36 border-amber-400 scale-102 ring-4 ring-amber-400/30'
                  : 'w-72 h-40 border-green-400/90'
              }`}
            >
              <div className="flex justify-between">
                <div
                  className={`w-6 h-6 border-t-4 border-l-4 -mt-1 -ml-1 rounded-tl-lg transition-colors ${
                    isCaptured ? 'border-green-300' : isAutoZooming ? 'border-amber-400' : 'border-green-400'
                  }`}
                />
                <div
                  className={`w-6 h-6 border-t-4 border-r-4 -mt-1 -mr-1 rounded-tr-lg transition-colors ${
                    isCaptured ? 'border-green-300' : isAutoZooming ? 'border-amber-400' : 'border-green-400'
                  }`}
                />
              </div>

              {/* Laser Scanning Beam */}
              {!isCaptured && (
                <div className="w-full h-0.5 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse" />
              )}

              <div className="flex justify-between">
                <div
                  className={`w-6 h-6 border-b-4 border-l-4 -mb-1 -ml-1 rounded-bl-lg transition-colors ${
                    isCaptured ? 'border-green-300' : isAutoZooming ? 'border-amber-400' : 'border-green-400'
                  }`}
                />
                <div
                  className={`w-6 h-6 border-b-4 border-r-4 -mb-1 -mr-1 rounded-br-lg transition-colors ${
                    isCaptured ? 'border-green-300' : isAutoZooming ? 'border-amber-400' : 'border-green-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* GPay-style Capture Flash and Banner */}
          {isCaptured && (
            <div className="absolute inset-0 bg-green-600/30 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in zoom-in duration-150">
              <div className="bg-green-600 text-white font-black text-center p-5 rounded-3xl shadow-2xl flex flex-col items-center space-y-2 border-2 border-green-300">
                <CheckCircle2 className="w-12 h-12 text-white animate-bounce" />
                <div className="text-xl tracking-tight uppercase">Captured!</div>
                <div className="text-xs font-mono bg-black/30 px-3 py-1 rounded-full text-green-100">
                  {isCaptured}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual Zoom Selector Chips */}
        <div className="absolute bottom-5 z-20 flex items-center bg-gray-900/95 border border-gray-700 backdrop-blur-md rounded-full px-2 py-1 shadow-2xl space-x-1">
          {[1.0, 2.0, 3.0, 4.0].map((z) => (
            <button
              key={z}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                applyZoom(z);
              }}
              className={`px-3 py-1 rounded-full text-xs font-black transition active:scale-95 ${
                Math.abs(currentZoom - z) < 0.3
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {z === 4.0 ? '4x (Macro)' : `${z}x`}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="absolute top-6 left-6 right-6 bg-amber-600/95 text-white text-xs p-3.5 rounded-xl text-center backdrop-blur-sm border border-amber-400 shadow-lg flex items-center justify-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Manual Input and Tap-to-Test Barcodes */}
      <div className="p-3 bg-gray-950 border-t border-gray-800 text-white space-y-2 z-10">
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Type barcode or SKU..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-green-500"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center transition active:scale-95"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <div>
          <div className="text-[10px] text-gray-400 mb-1 font-medium">Quick Tap Test Barcodes:</div>
          <div className="flex flex-wrap gap-1">
            {[
              { name: 'Lip Balm (4.5g)', code: '890123400017' },
              { name: 'Vicks (25g)', code: '890103000025' },
              { name: 'Vicks (10g)', code: '890103070001' },
              { name: 'Soap 100g', code: '890123400015' },
              { name: 'Milk 1L', code: '890123400001' },
            ].map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => handleBarcodeFound(item.code)}
                className="text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2 py-0.5 rounded text-green-300 font-medium active:scale-95 transition"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
