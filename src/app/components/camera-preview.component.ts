import {
  Component,
  computed,
  effect,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CameraService } from '../services/camera.service';
import { ArucoService } from '../services/aruco.service';
import { OcrService } from '../services/ocr.service';
import type {
  CardPosition,
  MarkerDetection,
  MarkerDetectionLog,
  PokemonCard,
} from '../../types/card.model';

/**
 * Component to display camera preview and handle card scanning
 */
@Component({
  selector: 'app-camera-preview',
  imports: [],
  template: `
    <div class="camera-container">
      @if (!cameraService.permissionGranted()) {
      <div class="permission-prompt">
        <h2>Camera Access Required</h2>
        <p>This app needs access to your camera to scan Pokemon cards.</p>
        <button (click)="requestPermissions()" class="btn-primary">Grant Camera Access</button>
        @if (cameraService.error()) {
        <p class="error">{{ cameraService.error() }}</p>
        }
      </div>
      } @else {
      <div class="video-wrapper">
        <video
          #videoElement
          autoplay
          playsinline
          [class.card-detected]="cardPosition() !== null"
        ></video>

        <svg
          class="overlay"
          [attr.viewBox]="'0 0 ' + videoSize().width + ' ' + videoSize().height"
          preserveAspectRatio="xMidYMid slice"
        >
          <!-- Draw detected markers -->
          @for (marker of markers(); track marker.id) {
          <polygon [attr.points]="getMarkerPolygonPoints(marker)" class="marker-outline" />
          <text
            [attr.x]="getMarkerCenter(marker).x"
            [attr.y]="getMarkerCenter(marker).y"
            class="marker-id"
          >
            {{ marker.id }}
          </text>
          }

          <!-- Draw card outline when detected -->
          @if (cardPosition(); as position) {
          <polygon [attr.points]="getPolygonPoints(position)" class="card-outline" />
          }
        </svg>

        <div class="controls">
          <button
            (click)="changeCamera()"
            class="btn-secondary"
            [disabled]="cameraService.devices().length <= 1"
          >
            <span class="icon">📷</span>
            Change Camera @if (cameraService.devices().length > 1) {
            <span class="device-count"
              >({{ currentDeviceIndex() + 1 }}/{{ cameraService.devices().length }})</span
            >
            }
          </button>
        </div>
      </div>
      }
    </div>
  `,
  styles: [
    `
      .camera-container {
        position: relative;
        width: 100%;
        max-width: 800px;
        margin: 0 auto;
      }

      .permission-prompt {
        text-align: center;
        padding: 3rem 2rem;
        background: #f5f5f5;
        border-radius: 8px;
        margin: 2rem 0;
      }

      .permission-prompt h2 {
        margin-top: 0;
        color: #333;
      }

      .permission-prompt p {
        color: #666;
        margin: 1rem 0;
      }

      .btn-primary {
        background: #cc0000;
        color: white;
        border: none;
        padding: 0.75rem 2rem;
        font-size: 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .btn-primary:hover {
        background: #990000;
      }

      .btn-secondary {
        background: #333;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .btn-secondary:hover:not(:disabled) {
        background: #555;
      }

      .btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .error {
        color: #cc0000;
        margin-top: 1rem;
        font-weight: bold;
      }

      .video-wrapper {
        position: relative;
        width: 100%;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
      }

      video {
        width: 100%;
        height: auto;
        display: block;
      }

      video.card-detected {
        /* Optional: Add visual feedback when card is detected */
      }

      .overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .marker-outline {
        fill: rgba(255, 0, 0, 0.2);
        stroke: #ff0000;
        stroke-width: 2;
        stroke-linejoin: round;
      }

      .marker-id {
        fill: #ff0000;
        font-size: 20px;
        font-weight: bold;
        text-anchor: middle;
        dominant-baseline: middle;
        stroke: white;
        stroke-width: 3;
        paint-order: stroke;
      }

      .card-outline {
        fill: none;
        stroke: #00ff00;
        stroke-width: 3;
        stroke-linejoin: round;
      }

      .controls {
        position: absolute;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 1rem;
      }

      .icon {
        font-size: 1.2rem;
      }

      .device-count {
        font-size: 0.8rem;
        opacity: 0.8;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraPreviewComponent implements OnDestroy {
  protected readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

  // Scanning state - exposed for parent components
  readonly markers = signal<MarkerDetection[]>([]);
  readonly cardPosition = signal<CardPosition | null>(null);
  readonly recognizedData = signal<Partial<PokemonCard>>({});
  readonly markerLogs = signal<MarkerDetectionLog[]>([]);
  readonly cardPreviewUrl = signal<string | null>(null);
  readonly videoSize = signal<{ width: number; height: number }>({ width: 0, height: 0 });
  private scanningIntervalId: number | null = null;
  private ocrIntervalId: number | null = null;
  private lastExtractedMarkerCount = 0;
  private cardDetectionPauseUntil = 0;

  protected readonly currentDeviceIndex = computed(() => {
    const devices = this.cameraService.devices();
    const selectedId = this.cameraService.selectedDeviceId();
    return devices.findIndex((d) => d.deviceId === selectedId);
  });

  constructor(
    protected readonly cameraService: CameraService,
    private arucoService: ArucoService,
    private ocrService: OcrService
  ) {
    // Set up video stream when it changes
    effect(() => {
      const stream = this.cameraService.stream();
      const video = this.videoElement()?.nativeElement;

      if (stream && video) {
        video.srcObject = stream;
        this.startScanning();
      } else {
        this.stopScanning();
      }
    });
  }

  /**
   * Request camera permissions
   */
  protected async requestPermissions(): Promise<void> {
    await this.cameraService.requestPermissions();
  }

  /**
   * Change to next available camera
   */
  protected async changeCamera(): Promise<void> {
    await this.cameraService.selectNextCamera();
  }

  /**
   * Start scanning for markers and cards
   */
  private startScanning(): void {
    this.stopScanning();
    console.log('Starting scanning process');

    // Scan for markers at 1 FPS (once per second)
    this.scanningIntervalId = window.setInterval(async () => {
      const video = this.videoElement()?.nativeElement;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }

      // Check if we're in the pause period after card detection
      const now = Date.now();
      if (now < this.cardDetectionPauseUntil) {
        const remainingSeconds = Math.ceil((this.cardDetectionPauseUntil - now) / 1000);
        if (remainingSeconds % 5 === 0) {
          console.log(`⏸️  Paused for debugging (${remainingSeconds}s remaining)`);
        }
        return;
      }

      // Update video size for SVG viewBox
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        this.videoSize.set({ width: video.videoWidth, height: video.videoHeight });
      }

      // Detect markers (async)
      const allDetectedMarkers = await this.arucoService.detectMarkers(video);

      // Filter to only markers 0-3 (the corner markers for the card)
      const detectedMarkers = allDetectedMarkers.filter((m) => m.id >= 0 && m.id <= 3);
      this.markers.set(detectedMarkers);

      // Log newly detected markers
      if (detectedMarkers.length > 0) {
        const timestamp = Date.now();
        const newLogs: MarkerDetectionLog[] = detectedMarkers.map((marker) => {
          const center = this.getMarkerCenter(marker);
          return {
            timestamp,
            markerId: marker.id,
            location: center,
          };
        });

        // Keep only the last 20 log entries
        this.markerLogs.update((logs) => [...newLogs, ...logs].slice(0, 20));
      }

      // Calculate card position
      const position = this.arucoService.calculateCardPosition(detectedMarkers);
      this.cardPosition.set(position);

      // Extract card preview when we have a valid position
      // This will be when we have markers 0&3, or 1&2, or more markers
      if (position && detectedMarkers.length !== this.lastExtractedMarkerCount) {
        this.lastExtractedMarkerCount = detectedMarkers.length;
        const cardImageUrl = this.arucoService.extractCardImage(
          video,
          position,
          detectedMarkers,
          true
        );
        if (cardImageUrl) {
          this.cardPreviewUrl.set(cardImageUrl);
          console.log(
            `✅ Extracted card preview with ${
              detectedMarkers.length
            } markers (IDs: ${detectedMarkers.map((m) => m.id).join(', ')})`
          );
          console.log('⏸️  Pausing scanning for 30 seconds for debugging...');
          // Pause scanning for 30 seconds after card detection
          this.cardDetectionPauseUntil = Date.now() + 30000;
        }
      } else if (!position) {
        this.lastExtractedMarkerCount = 0;
      }

      // If card is detected with high confidence, perform OCR
      if (position && position.confidence > 0.7) {
        this.performOCR(video, position);
      }
    }, 1000); // 1 FPS (once per second)
  }

  /**
   * Stop scanning
   */
  private stopScanning(): void {
    if (this.scanningIntervalId !== null) {
      clearInterval(this.scanningIntervalId);
      this.scanningIntervalId = null;
    }
    if (this.ocrIntervalId !== null) {
      clearInterval(this.ocrIntervalId);
      this.ocrIntervalId = null;
    }
  }

  /**
   * Perform OCR on card regions
   */
  private async performOCR(video: HTMLVideoElement, position: CardPosition): Promise<void> {
    // Throttle OCR to avoid overwhelming the system
    if (this.ocrIntervalId !== null) {
      return;
    }

    this.ocrIntervalId = window.setTimeout(async () => {
      try {
        // Extract and process top region
        const topRegion = this.arucoService.extractCardRegion(video, position, 'top');
        if (topRegion) {
          const topText = await this.ocrService.recognizeText(topRegion);
          const topData = this.ocrService.parseTopSection(topText);
          this.recognizedData.update((current) => ({ ...current, ...topData }));
        }

        // Extract and process bottom region
        const bottomRegion = this.arucoService.extractCardRegion(video, position, 'bottom');
        if (bottomRegion) {
          const bottomText = await this.ocrService.recognizeText(bottomRegion);
          const bottomData = this.ocrService.parseBottomSection(bottomText);
          this.recognizedData.update((current) => ({ ...current, ...bottomData }));
        }
      } catch (err) {
        console.error('OCR error:', err);
      } finally {
        this.ocrIntervalId = null;
      }
    }, 2000); // Perform OCR every 2 seconds
  }

  /**
   * Convert card position to SVG polygon points string
   */
  protected getPolygonPoints(position: CardPosition): string {
    return position.corners.map(([x, y]) => `${x},${y}`).join(' ');
  }

  /**
   * Convert marker corners to SVG polygon points string
   */
  protected getMarkerPolygonPoints(marker: MarkerDetection): string {
    return marker.corners.map(([x, y]) => `${x},${y}`).join(' ');
  }

  /**
   * Calculate center point of marker for label placement
   */
  protected getMarkerCenter(marker: MarkerDetection): { x: number; y: number } {
    const sumX = marker.corners.reduce((sum, [x]) => sum + x, 0);
    const sumY = marker.corners.reduce((sum, [, y]) => sum + y, 0);
    return {
      x: sumX / marker.corners.length,
      y: sumY / marker.corners.length,
    };
  }

  ngOnDestroy(): void {
    this.stopScanning();
  }
}
