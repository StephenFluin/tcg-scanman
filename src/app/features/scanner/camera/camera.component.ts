import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
  output,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="camera-container">
      @if (error()) {
      <div class="error">{{ error() }}</div>
      }

      <div class="video-wrapper">
        <video #video autoplay playsinline muted (loadedmetadata)="onVideoLoaded()"></video>
        <canvas #canvas></canvas>
      </div>

      <div class="controls">
        @if (devices().length > 1) {
        <button (click)="switchCamera()">Switch Camera</button>
        } @if (!stream()) {
        <button (click)="startCamera()">Start Camera</button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .camera-container {
        position: relative;
        width: 100%;
        max-width: 640px;
        margin: 0 auto;
      }
      .video-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 4/3;
        background: #000;
        overflow: hidden;
        border-radius: 8px;
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .controls {
        margin-top: 1rem;
        display: flex;
        gap: 1rem;
        justify-content: center;
      }
      .error {
        color: red;
        padding: 1rem;
        text-align: center;
      }
    `,
  ],
})
export class CameraComponent implements OnInit, OnDestroy {
  videoElement = viewChild<ElementRef<HTMLVideoElement>>('video');
  canvasElement = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  stream = signal<MediaStream | null>(null);
  error = signal<string | null>(null);
  devices = signal<MediaDeviceInfo[]>([]);
  currentDeviceId = signal<string | null>(null);

  videoReady = output<HTMLVideoElement>();
  canvasReady = output<HTMLCanvasElement>();

  constructor() {
    effect(() => {
      const vid = this.videoElement()?.nativeElement;
      if (vid) {
        this.videoReady.emit(vid);
      }
      const can = this.canvasElement()?.nativeElement;
      if (can) {
        this.canvasReady.emit(can);
      }
    });
  }

  async ngOnInit() {
    await this.getDevices();
    await this.startCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      this.devices.set(videoDevices);
    } catch (err) {
      console.error('Error listing devices', err);
    }
  }

  async startCamera(deviceId?: string) {
    this.stopCamera();
    this.error.set(null);

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : 'environment', // Prefer back camera initially
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream.set(stream);

      const video = this.videoElement()?.nativeElement;
      if (video) {
        video.srcObject = stream;
      }

      // Update current device ID if not provided
      if (!deviceId) {
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.deviceId) {
          this.currentDeviceId.set(settings.deviceId);
        }
      } else {
        this.currentDeviceId.set(deviceId);
      }
    } catch (err) {
      this.error.set('Could not access camera. Please grant permissions.');
      console.error('Error accessing camera', err);
    }
  }

  stopCamera() {
    const stream = this.stream();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this.stream.set(null);
    }
  }

  async switchCamera() {
    const devices = this.devices();
    if (devices.length < 2) return;

    const currentId = this.currentDeviceId();
    const currentIndex = devices.findIndex((d) => d.deviceId === currentId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];

    await this.startCamera(nextDevice.deviceId);
  }

  onVideoLoaded() {
    // Video is ready to play
    const video = this.videoElement()?.nativeElement;
    if (video) {
      video.play().catch((e) => console.error('Error playing video', e));
    }
  }
}
