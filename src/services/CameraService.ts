export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export class CameraService {
  private stream: MediaStream | null = null;

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    );
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

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  }

  stopCamera(videoElement?: HTMLVideoElement | null): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }
}

export const cameraService = new CameraService();

