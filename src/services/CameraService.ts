export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface ActiveViewportRect {
  /** Pixel X offset of the active non-pillarboxed image inside the video/image frame */
  x: number;
  /** Pixel Y offset of the active non-letterboxed image inside the video/image frame */
  y: number;
  /** Pixel width of the active image region */
  width: number;
  /** Pixel height of the active image region */
  height: number;
  /** Full container width */
  fullWidth: number;
  /** Full container height */
  fullHeight: number;
  /** True when vertical 9:16 mobile portrait video is embedded with black pillarbox bars inside a 16:9 frame */
  isPillarboxedPortrait: boolean;
  /** True when the active stream comes from Iriun / mobile virtual webcam or portrait mobile stream */
  isMobileFeed: boolean;
}

/**
 * Detects whether a video input device label corresponds to Iriun Webcam
 * or another smartphone-to-PC virtual camera bridge (DroidCam, EpocCam, Camo, iVCam).
 */
export function isMobileBridgeCameraLabel(label: string): boolean {
  return /iriun|droidcam|epoccam|camo|ivcam|scrcpy|phone|celular|android|iphone/i.test(
    (label || '').trim()
  );
}

/**
 * Pure, unit-testable pillarbox/letterbox viewport detector from a downsampled RGBA probe grid.
 * When Iriun Webcam streams a vertical (9:16) smartphone camera inside a 1280x720 (16:9) desktop
 * video container, it pads the left and right sides with solid black pillarbox bars.
 * Extracting the active inner rectangle restores true 9:16 mobile aspect ratio and 3x spatial resolution.
 */
export function computeActiveViewportFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  probeW: number,
  probeH: number,
  fullWidth: number,
  fullHeight: number,
  isMobileBridge = false
): ActiveViewportRect {
  const fallback: ActiveViewportRect = {
    x: 0,
    y: 0,
    width: Math.max(1, fullWidth),
    height: Math.max(1, fullHeight),
    fullWidth: Math.max(1, fullWidth),
    fullHeight: Math.max(1, fullHeight),
    isPillarboxedPortrait: false,
    isMobileFeed: isMobileBridge || fullHeight > fullWidth,
  };

  if (
    probeW < 16 ||
    probeH < 16 ||
    fullWidth <= 0 ||
    fullHeight <= 0 ||
    rgba.length < probeW * probeH * 4
  ) {
    return fallback;
  }

  const isBlackColumn = (col: number): boolean => {
    let darkRows = 0;
    let totalRows = 0;
    for (let row = 2; row < probeH - 2; row++) {
      totalRows++;
      const idx = (row * probeW + col) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      // Strict pillarbox black threshold (R,G,B <= 14) so dim room walls never trigger dynamic cropping
      if (r <= 14 && g <= 14 && b <= 14) {
        darkRows++;
      }
    }
    return totalRows > 0 && darkRows / totalRows >= 0.95;
  };

  const maxSideScan = Math.floor(probeW * 0.37);
  let leftBarCols = 0;
  while (leftBarCols < maxSideScan && isBlackColumn(leftBarCols)) {
    leftBarCols++;
  }

  let rightBarCols = 0;
  while (rightBarCols < maxSideScan && isBlackColumn(probeW - 1 - rightBarCols)) {
    rightBarCols++;
  }

  // Confirm strictly symmetric side pillarbox bars (at least 18% width on each side and symmetric within 4 probe columns)
  // This prevents dark objects or shadows on one side of the room from ever shifting or "zooming" the active viewport!
  const minBarCols = Math.max(8, Math.floor(probeW * 0.18));
  const isSymmetricPillarbox = Math.abs(leftBarCols - rightBarCols) <= 4;
  if (leftBarCols >= minBarCols && rightBarCols >= minBarCols && isSymmetricPillarbox) {
    const avgBarCols = Math.round((leftBarCols + rightBarCols) / 2);
    const activeProbeCols = Math.max(8, probeW - avgBarCols * 2);
    const x = Math.round((avgBarCols / probeW) * fullWidth);
    const width = Math.max(64, Math.min(fullWidth - x, Math.round((activeProbeCols / probeW) * fullWidth)));
    const isPillarboxedPortrait = width < fullHeight * 0.98;
    return {
      x,
      y: 0,
      width,
      height: fullHeight,
      fullWidth,
      fullHeight,
      isPillarboxedPortrait,
      isMobileFeed: true,
    };
  }

  return fallback;
}

/**
 * Remaps a percentage bounding box [0..100] detected inside the cropped active viewport
 * back to full video container coordinates [0..100] so canvas overlays align pixel-for-pixel.
 */
export function remapViewportBboxToFullFrame(
  bbox: { x: number; y: number; width: number; height: number },
  viewport: ActiveViewportRect
): { x: number; y: number; width: number; height: number } {
  if (
    viewport.x === 0 &&
    viewport.y === 0 &&
    viewport.width === viewport.fullWidth &&
    viewport.height === viewport.fullHeight
  ) {
    return bbox;
  }
  const offsetXPct = (viewport.x / Math.max(1, viewport.fullWidth)) * 100;
  const scaleX = viewport.width / Math.max(1, viewport.fullWidth);
  const offsetYPct = (viewport.y / Math.max(1, viewport.fullHeight)) * 100;
  const scaleY = viewport.height / Math.max(1, viewport.fullHeight);

  const x = Math.max(0, Math.min(100, offsetXPct + bbox.x * scaleX));
  const y = Math.max(0, Math.min(100, offsetYPct + bbox.y * scaleY));
  const width = Math.max(1, Math.min(100 - x, bbox.width * scaleX));
  const height = Math.max(1, Math.min(100 - y, bbox.height * scaleY));
  return { x, y, width, height };
}

export class CameraService {
  private stream: MediaStream | null = null;
  private activeDeviceLabel = '';
  private activeIsMobileBridge = false;
  private probeCanvas: HTMLCanvasElement | null = null;
  private lockedViewport: ActiveViewportRect | null = null;
  private pillarboxStreak = 0;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    );
  }

  isIriunOrMobileCameraActive(): boolean {
    return this.activeIsMobileBridge;
  }

  getActiveCameraLabel(): string {
    return this.activeDeviceLabel;
  }

  /**
   * For testing or manual override of the mobile bridge profile.
   */
  setMobileBridgeState(isMobileBridge: boolean, label = ''): void {
    this.activeIsMobileBridge = isMobileBridge;
    this.activeDeviceLabel = label;
  }

  /**
   * Selects the best default camera for the live demo:
   * automatically prioritizes Iriun Webcam / DroidCam / smartphone virtual cameras over built-in laptop webcams.
   */
  findPreferredCamera(devices: CameraDeviceInfo[]): CameraDeviceInfo | null {
    if (!devices || devices.length === 0) return null;
    const mobileBridge = devices.find((d) => isMobileBridgeCameraLabel(d.label));
    return mobileBridge ?? devices[0];
  }

  async listCameras(): Promise<CameraDeviceInfo[]> {
    if (!this.isSupported() || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Cámara ${idx + 1}`,
      }));
  }

  async startCamera(
    videoElement: HTMLVideoElement,
    deviceId?: string
  ): Promise<MediaStream> {
    this.stopCamera(videoElement);

    if (!this.isSupported()) {
      throw new Error('La API de cámara (getUserMedia) no es compatible con este navegador.');
    }

    let targetDeviceId = deviceId;
    if (!targetDeviceId) {
      try {
        const list = await this.listCameras();
        const preferred = this.findPreferredCamera(list);
        if (preferred && isMobileBridgeCameraLabel(preferred.label) && preferred.deviceId) {
          targetDeviceId = preferred.deviceId;
        }
      } catch {
        // Proceed with default constraints if enumeration before permission is unavailable
      }
    }

    const constraints: MediaStreamConstraints = {
      video: targetDeviceId
        ? {
            deviceId: { exact: targetDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          }
        : {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;

    // Inspect active video track label to detect Iriun Webcam even on initial start
    const track = stream.getVideoTracks?.()[0];
    let trackLabel = track?.label || '';
    if (!trackLabel && targetDeviceId) {
      const list = await this.listCameras().catch(() => []);
      trackLabel = list.find((d) => d.deviceId === targetDeviceId)?.label || '';
    }

    // If user didn't force a specific webcam and Iriun Webcam became visible after permission grant, auto-switch to Iriun!
    if (!deviceId && !isMobileBridgeCameraLabel(trackLabel)) {
      const unlockedList = await this.listCameras().catch(() => []);
      const iriunCam = unlockedList.find((d) => isMobileBridgeCameraLabel(d.label));
      if (iriunCam && iriunCam.deviceId) {
        for (const t of stream.getTracks()) t.stop();
        const iriunStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: iriunCam.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
        this.stream = iriunStream;
        trackLabel = iriunStream.getVideoTracks?.()[0]?.label || iriunCam.label;
      }
    }

    this.activeDeviceLabel = trackLabel;
    this.activeIsMobileBridge = isMobileBridgeCameraLabel(trackLabel);

    videoElement.srcObject = this.stream;
    await videoElement.play();
    return this.stream;
  }

  /**
   * Detects the active non-pillarboxed image viewport from a live video or image element.
   */
  detectActiveViewport(source: HTMLVideoElement | HTMLImageElement): ActiveViewportRect {
    const fullWidth =
      source instanceof HTMLVideoElement
        ? source.videoWidth || 640
        : source.naturalWidth || source.width || 640;
    const fullHeight =
      source instanceof HTMLVideoElement
        ? source.videoHeight || 480
        : source.naturalHeight || source.height || 480;

    if (typeof document === 'undefined' || fullWidth <= 0 || fullHeight <= 0) {
      return {
        x: 0,
        y: 0,
        width: Math.max(1, fullWidth),
        height: Math.max(1, fullHeight),
        fullWidth: Math.max(1, fullWidth),
        fullHeight: Math.max(1, fullHeight),
        isPillarboxedPortrait: false,
        isMobileFeed: this.activeIsMobileBridge || fullHeight > fullWidth,
      };
    }

    // Only landscape containers (fullWidth > fullHeight) can contain 9:16 portrait pillarbox bars
    if (fullWidth <= fullHeight) {
      return {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
        fullWidth,
        fullHeight,
        isPillarboxedPortrait: false,
        isMobileFeed: true,
      };
    }

    const probeW = 96;
    const probeH = 54;
    if (!this.probeCanvas) {
      this.probeCanvas = document.createElement('canvas');
      this.probeCanvas.width = probeW;
      this.probeCanvas.height = probeH;
    }
    const ctx = this.probeCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
        fullWidth,
        fullHeight,
        isPillarboxedPortrait: false,
        isMobileFeed: this.activeIsMobileBridge,
      };
    }

    ctx.drawImage(source, 0, 0, probeW, probeH);
    const rgba = ctx.getImageData(0, 0, probeW, probeH).data;
    const rawVp = computeActiveViewportFromRgba(
      rgba,
      probeW,
      probeH,
      fullWidth,
      fullHeight,
      this.activeIsMobileBridge
    );

    // For static images, return immediately
    if (!(source instanceof HTMLVideoElement)) {
      return rawVp;
    }

    // For live video streams, apply temporal hysteresis lock so the active viewport
    // NEVER jitters or changes zoom from frame to frame!
    if (rawVp.isPillarboxedPortrait) {
      this.pillarboxStreak = Math.min(6, this.pillarboxStreak + 1);
      if (this.pillarboxStreak >= 2) {
        if (
          !this.lockedViewport ||
          !this.lockedViewport.isPillarboxedPortrait ||
          this.lockedViewport.fullWidth !== fullWidth ||
          this.lockedViewport.fullHeight !== fullHeight
        ) {
          this.lockedViewport = rawVp;
        }
        return this.lockedViewport;
      }
    } else {
      this.pillarboxStreak = Math.max(0, this.pillarboxStreak - 1);
      if (this.pillarboxStreak === 0) {
        this.lockedViewport = rawVp;
      }
    }

    return (
      this.lockedViewport ?? {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
        fullWidth,
        fullHeight,
        isPillarboxedPortrait: false,
        isMobileFeed: this.activeIsMobileBridge,
      }
    );
  }

  stopCamera(videoElement?: HTMLVideoElement | null): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.activeDeviceLabel = '';
    this.activeIsMobileBridge = false;
    this.lockedViewport = null;
    this.pillarboxStreak = 0;
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }
}

export const cameraService = new CameraService();
