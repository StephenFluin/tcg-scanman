import { Component, inject, signal, viewChild, ElementRef, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraComponent } from './camera/camera.component';
import { CardDetailsComponent, CardInfo } from './card-details/card-details.component';
import { OpencvService } from '../../core/services/opencv.service';
import { OcrService } from '../../core/services/ocr.service';
import { AR } from 'js-aruco2';

@Component({
  selector: 'app-scanner',
  standalone: true,
  imports: [CommonModule, CameraComponent, CardDetailsComponent],
  template: `
    <div class="scanner-layout">
      <div class="camera-section">
        <app-camera
          (videoReady)="onVideoReady($event)"
          (canvasReady)="onCanvasReady($event)"
        ></app-camera>
      </div>
      <div class="details-section">
        <div class="actions">
          <button (click)="manualScan()">Manual Scan</button>
          <button (click)="toggleDebug()">{{ debugMode() ? 'Hide Debug' : 'Show Debug' }}</button>
          <button (click)="debugFullOcr()">Debug Full OCR</button>
        </div>
        <app-card-details
          [info]="cardInfo()"
          [status]="status()"
          [logs]="logs()"
          [ocrImages]="ocrImages()"
        ></app-card-details>
      </div>
    </div>
    <div style="display:none">
      <canvas #processCanvas></canvas>
    </div>
  `,
  styles: [
    `
      .scanner-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
        padding: 1rem;
      }
      @media (min-width: 768px) {
        .scanner-layout {
          grid-template-columns: 2fr 1fr;
        }
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      .actions button {
        flex: 1;
        padding: 0.5rem;
        cursor: pointer;
      }
    `,
  ],
})
export class ScannerComponent implements OnDestroy {
  private opencvService = inject(OpencvService);
  private ocrService = inject(OcrService);

  cardInfo = signal<CardInfo | null>(null);
  status = signal<string>('Initializing...');
  logs = signal<string[]>([]);
  debugMode = signal(false);
  ocrImages = signal<{ top: string | null; bottom: string | null }>({ top: null, bottom: null });

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Hidden canvas for processing
  processCanvas = viewChild<ElementRef<HTMLCanvasElement>>('processCanvas');

  private isScanning = false;
  private isProcessingOcr = false;
  private animationFrameId: number | null = null;
  private lastOcrTime = 0;
  private readonly OCR_INTERVAL = 1000; // Run OCR every 1s if card detected

  // Stability tracking
  private detectionStabilityCount = 0;
  private readonly STABILITY_THRESHOLD = 3; // Require 3 consecutive detections

  // Store detected card points for manual scan
  private lastDetectedPoints: any[] | null = null;

  addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.update((logs) => [`[${timestamp}] ${message}`, ...logs].slice(0, 50));
  }

  toggleDebug() {
    this.debugMode.update((v) => !v);
    this.addLog(`Debug mode ${this.debugMode() ? 'enabled' : 'disabled'}`);
  }

  async debugFullOcr() {
    if (!this.videoElement || !this.opencvService.isReady()) return;
    if (this.isProcessingOcr) {
      this.addLog('Scan in progress. Please wait...');
      return;
    }

    this.addLog('Debug Full OCR: Capturing full frame...');
    this.isProcessingOcr = true;

    try {
      const video = this.videoElement;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      this.addLog('Debug Full OCR: Running OCR on entire frame...');
      const result = await this.ocrService.recognize(canvas);

      const fullText = result?.text || '';
      const confidence = Math.round(result?.confidence || 0);

      this.addLog(`Debug Full OCR Result (${confidence}% confidence):`);
      const lines = fullText.split('\n').filter((l: string) => l.trim().length > 0);
      lines.forEach((line: string, i: number) => {
        this.addLog(`  Line ${i + 1}: "${line}"`);
      });

      // Save the full frame image
      this.ocrImages.update((imgs) => ({
        ...imgs,
        top: canvas.toDataURL('image/jpeg'),
      }));
    } catch (err: any) {
      console.error('Debug Full OCR error', err);
      this.addLog(`Debug Full OCR error: ${err?.message || err}`);
    } finally {
      this.isProcessingOcr = false;
    }
  }

  async manualScan() {
    if (!this.videoElement || !this.opencvService.isReady()) return;
    if (this.isProcessingOcr) {
      this.addLog('Scan in progress. Please wait...');
      return;
    }

    this.addLog('Manual scan triggered...');
    const hasPoints = !!this.lastDetectedPoints;
    const hasCanvas = !!this.processCanvas();
    const pointsCount = this.lastDetectedPoints?.length || 0;
    this.addLog(`Debug: hasPoints=${hasPoints}, hasCanvas=${hasCanvas}, count=${pointsCount}`);

    // Check if we have recently detected card points from auto-scan
    if (this.lastDetectedPoints && this.processCanvas()) {
      this.isProcessingOcr = true;
      try {
        const canvas = this.processCanvas()!.nativeElement;
        this.addLog('Manual Scan: Using detected card position from auto-scan');
        await this.performOcr(canvas, this.lastDetectedPoints);
      } catch (err: any) {
        console.error('Manual scan error', err);
        const errorMsg = err?.message || err?.toString() || 'Unknown error';
        this.addLog(`Manual scan error: ${errorMsg}`);
      } finally {
        this.isProcessingOcr = false;
      }
    } else {
      this.addLog(
        'Manual Scan: No card detected. Please position the card with all 4 markers visible.'
      );
    }
  }

  constructor() {
    effect(() => {
      if (this.opencvService.isReady() && this.videoElement && this.canvasElement) {
        this.status.set('System Ready. Starting scan...');
        this.addLog('OpenCV Ready. Camera Ready. Starting scan loop.');
        this.startScanning();
      } else {
        this.status.set('Waiting for OpenCV or Camera...');
      }
    });
  }
  onVideoReady(video: HTMLVideoElement) {
    this.videoElement = video;
    if (this.opencvService.isReady() && this.canvasElement) {
      this.startScanning();
    }
  }

  onCanvasReady(canvas: HTMLCanvasElement) {
    this.canvasElement = canvas;
    this.ctx = canvas.getContext('2d');
    if (this.opencvService.isReady() && this.videoElement) {
      this.startScanning();
    }
  }

  ngOnDestroy() {
    this.stopScanning();
  }

  startScanning() {
    if (this.isScanning) return;
    this.isScanning = true;
    this.processFrame();
  }

  stopScanning() {
    this.isScanning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  async processFrame() {
    if (
      !this.isScanning ||
      !this.videoElement ||
      !this.canvasElement ||
      !this.ctx ||
      !this.opencvService.isReady()
    ) {
      return;
    }

    const cv = this.opencvService.cv;
    const video = this.videoElement;
    const canvas = this.canvasElement;
    const ctx = this.ctx;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      this.animationFrameId = requestAnimationFrame(() => this.processFrame());
      return;
    }

    // 1. Setup Canvas
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Video to Processing Canvas (Hidden)
    const pCanvas = this.processCanvas()!.nativeElement;
    if (pCanvas.width !== video.videoWidth || pCanvas.height !== video.videoHeight) {
      pCanvas.width = video.videoWidth;
      pCanvas.height = video.videoHeight;
    }
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    // 3. Call the appropriate detection algorithm
    let bestPolyPoints: any[] | null = null;
    let maxScore = 0;

    try {
      const detectionResult = await this.detectCard(pCanvas, cv, video);
      bestPolyPoints = detectionResult.points;
      maxScore = detectionResult.score;

      // Debug logging
      if (bestPolyPoints && Math.random() < 0.1) {
        // Log 10% of the time to avoid spam
        console.log('[FRAME] bestPolyPoints:', bestPolyPoints ? 'EXISTS' : 'NULL');
        console.log('[FRAME] About to store lastDetectedPoints');
      }
    } catch (err) {
      console.error('Detection Error', err);
    }

    // 4. Draw Detection Results
    if (!this.debugMode()) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (bestPolyPoints) {
      // Store the latest detected points for manual scan (store immediately, don't wait for stability)
      this.lastDetectedPoints = [...bestPolyPoints]; // Clone the array

      // Increment stability counter
      this.detectionStabilityCount++; // Only consider it "stable" after STABILITY_THRESHOLD consecutive detections
      if (this.detectionStabilityCount >= this.STABILITY_THRESHOLD) {
        this.status.set(`Card Detected!`);

        if (this.debugMode()) {
          console.log(`[DEBUG] ✓ STABLE CARD DETECTED with score: ${Math.floor(maxScore)}`);
        }

        // Draw green detection box
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bestPolyPoints[0].x, bestPolyPoints[0].y);
        ctx.lineTo(bestPolyPoints[1].x, bestPolyPoints[1].y);
        ctx.lineTo(bestPolyPoints[2].x, bestPolyPoints[2].y);
        ctx.lineTo(bestPolyPoints[3].x, bestPolyPoints[3].y);
        ctx.closePath();
        ctx.stroke();

        // Trigger OCR at intervals
        const now = Date.now();
        if (now - this.lastOcrTime > this.OCR_INTERVAL && !this.isProcessingOcr) {
          this.lastOcrTime = now;
          this.isProcessingOcr = true;
          this.performOcr(pCanvas, bestPolyPoints).finally(() => {
            this.isProcessingOcr = false;
          });
        }
      } else {
        this.status.set(
          `Detecting... (${this.detectionStabilityCount}/${this.STABILITY_THRESHOLD})`
        );

        // Draw yellow detection box while stabilizing
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bestPolyPoints[0].x, bestPolyPoints[0].y);
        ctx.lineTo(bestPolyPoints[1].x, bestPolyPoints[1].y);
        ctx.lineTo(bestPolyPoints[2].x, bestPolyPoints[2].y);
        ctx.lineTo(bestPolyPoints[3].x, bestPolyPoints[3].y);
        ctx.closePath();
        ctx.stroke();
      }
    } else {
      // Reset stability counter and stored points if no detection
      this.detectionStabilityCount = 0;
      this.lastDetectedPoints = null;
      this.status.set('Scanning...');
      if (this.debugMode()) {
        console.log(`[DEBUG] ✗ NO CARD DETECTED`);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
  }

  /**
   * Main detection - uses ArUco markers only
   */
  async detectCard(
    canvas: HTMLCanvasElement,
    cv: any,
    video: HTMLVideoElement
  ): Promise<{ points: any[] | null; score: number }> {
    // Use ArUco marker detection only - requires markers to be visible
    const arucoResult = this.detectCardWithAruco(canvas, cv, video);
    return arucoResult;
  }

  /**
   * Detect card position using ArUco markers
   * Assumes markers are placed at known positions relative to the card
   */
  detectCardWithAruco(
    canvas: HTMLCanvasElement,
    cv: any,
    video: HTMLVideoElement
  ): { points: any[] | null; score: number } {
    let src: any;

    try {
      // Get image data from canvas for js-aruco2
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { points: null, score: 0 };
      }

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Create ArUco detector using ARUCO dictionary (default for js-aruco2)
      // Note: js-aruco2 uses 'ARUCO' dictionary, not OpenCV's DICT_4X4_50
      const detector = new AR.Detector({ dictionaryName: 'ARUCO' });

      // Detect markers
      const markers = detector.detect(imageData);

      if (markers.length > 0) {
        if (this.debugMode()) {
          this.addLog(
            `Detected ${markers.length} ArUco markers: ${markers.map((m) => m.id).join(', ')}`
          );
        }

        // Draw detected markers in debug mode
        if (this.debugMode() && this.ctx) {
          // Draw on debug canvas
          this.ctx.clearRect(0, 0, this.canvasElement!.width, this.canvasElement!.height);
          this.ctx.drawImage(canvas, 0, 0, this.canvasElement!.width, this.canvasElement!.height);

          // Draw markers
          markers.forEach((marker) => {
            this.ctx!.strokeStyle = '#00ff00';
            this.ctx!.lineWidth = 3;
            this.ctx!.beginPath();

            const corners = marker.corners;
            this.ctx!.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) {
              this.ctx!.lineTo(corners[i].x, corners[i].y);
            }
            this.ctx!.closePath();
            this.ctx!.stroke();

            // Draw marker ID
            const center = {
              x: corners.reduce((sum, c) => sum + c.x, 0) / corners.length,
              y: corners.reduce((sum, c) => sum + c.y, 0) / corners.length,
            };
            this.ctx!.fillStyle = '#00ff00';
            this.ctx!.font = '20px Arial';
            this.ctx!.fillText(`ID: ${marker.id}`, center.x, center.y);
          });
        }

        // If we have at least 2 markers, we can infer the card position
        if (markers.length >= 2) {
          const cardPoints = this.calculateCardFromJsArucoMarkers(markers, cv);
          if (cardPoints) {
            return { points: cardPoints, score: 1000000 }; // High score for marker detection
          }
        }
      }

      return { points: null, score: 0 };
    } catch (err) {
      console.error('ArUco detection error:', err);
      if (this.debugMode()) {
        this.addLog(`ArUco error: ${err}`);
      }
      return { points: null, score: 0 };
    } finally {
      if (src) src.delete();
    }
  }

  /**
   * Calculate card corners from detected js-aruco2 markers using perspective transform and edge detection
   */
  calculateCardFromJsArucoMarkers(markers: any[], cv: any): any[] | null {
    let warped: any;

    try {
      // Convert js-aruco2 markers to our format and identify by ID
      const markerMap = new Map<number, any>();
      markers.forEach((marker) => {
        const center = {
          x: marker.corners.reduce((sum: number, c: any) => sum + c.x, 0) / marker.corners.length,
          y: marker.corners.reduce((sum: number, c: any) => sum + c.y, 0) / marker.corners.length,
        };

        if (this.debugMode()) {
          this.addLog(`Marker ${marker.id} at (${Math.floor(center.x)}, ${Math.floor(center.y)})`);
        }

        markerMap.set(marker.id, {
          id: marker.id,
          center,
          corners: marker.corners,
        });
      });

      // Need all 4 markers - sort them by position to identify corners
      if (markerMap.size < 4) {
        if (this.debugMode()) {
          this.addLog(
            `Need 4 markers. Found ${markerMap.size}: ${Array.from(markerMap.keys()).join(', ')}`
          );
        }
        return null;
      }

      // Sort markers by position to identify corners (top-left, top-right, bottom-right, bottom-left)
      const markerArray = Array.from(markerMap.values());
      markerArray.sort((a, b) => a.center.y - b.center.y); // Sort by Y
      const topTwo = markerArray.slice(0, 2).sort((a, b) => a.center.x - b.center.x); // Sort top 2 by X
      const bottomTwo = markerArray.slice(2, 4).sort((a, b) => a.center.x - b.center.x); // Sort bottom 2 by X

      const m0 = topTwo[0].center; // top-left
      const m1 = topTwo[1].center; // top-right
      const m2 = bottomTwo[1].center; // bottom-right
      const m3 = bottomTwo[0].center; // bottom-left

      if (this.debugMode()) {
        this.addLog(
          `Corner markers: TL=${topTwo[0].id}, TR=${topTwo[1].id}, BR=${bottomTwo[1].id}, BL=${bottomTwo[0].id}`
        );
      }

      // Create a perspective transform to flatten the paper
      // Use a standard size for the warped image (e.g., 1000x1000)
      const warpedSize = 1000;

      const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        m0.x,
        m0.y, // top-left
        m1.x,
        m1.y, // top-right
        m2.x,
        m2.y, // bottom-right
        m3.x,
        m3.y, // bottom-left
      ]);

      const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0, // top-left
        warpedSize,
        0, // top-right
        warpedSize,
        warpedSize, // bottom-right
        0,
        warpedSize, // bottom-left
      ]);

      const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

      // Get the source image from the canvas that was passed in
      // Need to create a temporary canvas to read from since the passed canvas might be from video
      const tempCanvas = document.createElement('canvas');
      const videoElement = this.videoElement;
      if (videoElement) {
        tempCanvas.width = videoElement.videoWidth;
        tempCanvas.height = videoElement.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(videoElement, 0, 0);
        }
      }

      const src = cv.imread(tempCanvas);
      warped = new cv.Mat();

      // Apply perspective transform
      cv.warpPerspective(src, warped, M, new cv.Size(warpedSize, warpedSize));

      // Calculate card position based on known layout from create-pokemon-pdf.py:
      // - Card: 63.5mm x 88.9mm
      // - Gap: 10mm between card edge and marker center
      // - Marker size: 20mm
      // - Total marker-to-marker: Card + 2*Gap + Marker = 63.5+20+20=103.5mm (horizontal)
      //                                                    88.9+20+20=128.9mm (vertical)
      //
      // In the warped image, markers are at (0,0), (warpedSize,0), (warpedSize,warpedSize), (0,warpedSize)
      // So the card should be centered in the warped space

      // Calculate card dimensions in warped space
      // The marker centers span the full warped image (0 to warpedSize)
      // From marker center to card edge: Gap + Marker/2 = 10 + 10 = 20mm
      // From marker center to marker center: 103.5mm (horizontal), 128.9mm (vertical)

      const totalWidthMM = 63.5 + 2 * 10 + 20; // Card + 2*Gap + Marker = 103.5mm
      const totalHeightMM = 88.9 + 2 * 10 + 20; // Card + 2*Gap + Marker = 128.9mm
      const cardWidthMM = 63.5;
      const cardHeightMM = 88.9;
      const gapMM = 10;
      const markerSizeMM = 20;

      // Margin from edge of warped image (marker center) to card edge in pixels
      const marginX = ((gapMM + markerSizeMM / 2) / totalWidthMM) * warpedSize;
      const marginY = ((gapMM + markerSizeMM / 2) / totalHeightMM) * warpedSize;

      // Card dimensions in pixels
      const cardWidthPx = (cardWidthMM / totalWidthMM) * warpedSize;
      const cardHeightPx = (cardHeightMM / totalHeightMM) * warpedSize;

      // Card position (top-left corner)
      const cardX = marginX;
      const cardY = marginY;

      if (this.debugMode()) {
        this.addLog(
          `Calculated card position: ${Math.round(cardX)}, ${Math.round(cardY)}, size: ${Math.round(
            cardWidthPx
          )}x${Math.round(cardHeightPx)}`
        );

        // Draw the calculated card rectangle on the warped image
        if (this.ctx && this.canvasElement) {
          const debugCanvas = document.createElement('canvas');
          debugCanvas.width = warpedSize;
          debugCanvas.height = warpedSize;
          cv.imshow(debugCanvas, warped);

          const debugCtx = debugCanvas.getContext('2d');
          if (debugCtx) {
            debugCtx.strokeStyle = '#00ff00';
            debugCtx.lineWidth = 3;
            debugCtx.strokeRect(cardX, cardY, cardWidthPx, cardHeightPx);
          }

          this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
          this.ctx.drawImage(
            debugCanvas,
            0,
            0,
            this.canvasElement.width,
            this.canvasElement.height
          );
        }
      }

      // Get the 4 corners of the card in warped space based on calculated position
      const warpedCardCorners = [
        { x: cardX, y: cardY },
        { x: cardX + cardWidthPx, y: cardY },
        { x: cardX + cardWidthPx, y: cardY + cardHeightPx },
        { x: cardX, y: cardY + cardHeightPx },
      ];

      // Transform these corners back to the original image space
      const invM = new cv.Mat();
      cv.invert(M, invM);

      const cardPoints = warpedCardCorners.map((pt) => {
        const srcPt = cv.matFromArray(1, 1, cv.CV_32FC2, [pt.x, pt.y]);
        const dstPt = new cv.Mat();
        cv.perspectiveTransform(srcPt, dstPt, invM);
        const result = { x: dstPt.data32F[0], y: dstPt.data32F[1] };
        srcPt.delete();
        dstPt.delete();
        return result;
      });

      invM.delete();
      srcPoints.delete();
      dstPoints.delete();
      M.delete();
      src.delete();

      return null;
    } catch (err) {
      console.error('Error calculating card from markers:', err);
      return null;
    } finally {
      if (warped) warped.delete();
    }
  }

  async performOcr(imageCanvas: HTMLCanvasElement, pointsInput: any) {
    const cv = this.opencvService.cv;

    // 1. Get the 4 points from the contour
    // Ensure points is an array (cv.RotatedRect.points might return an object with 0,1,2,3 keys)
    const points = Array.isArray(pointsInput)
      ? pointsInput
      : [pointsInput[0], pointsInput[1], pointsInput[2], pointsInput[3]];

    // Sort points to TL, TR, BR, BL
    // Simple sorting based on sum and diff of x,y
    // TL has min sum, BR has max sum
    // TR has min diff (x-y), BL has max diff (x-y) -- roughly

    // A more robust way:
    // Sort by Y to get top 2 and bottom 2
    points.sort((a, b) => a.y - b.y);
    const top = points.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);

    let tl = top[0];
    let tr = top[1];
    let bl = bottom[0];
    let br = bottom[1];

    // Apply an inward margin (5% on each side) to avoid capturing background
    // This ensures we only get the card content, not the area around it
    // A larger margin is better for OCR accuracy - we don't need the very edges
    const marginPercent = 0.05;

    // Calculate the vectors for inward adjustment
    const cardWidth = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
    const cardHeight = Math.sqrt(Math.pow(bl.x - tl.x, 2) + Math.pow(bl.y - tl.y, 2));

    const marginX = cardWidth * marginPercent;
    const marginY = cardHeight * marginPercent;

    // Move each corner inward
    const dx_top = (tr.x - tl.x) / cardWidth; // normalized direction vector
    const dy_top = (tr.y - tl.y) / cardWidth;
    const dx_left = (bl.x - tl.x) / cardHeight;
    const dy_left = (bl.y - tl.y) / cardHeight;

    tl = {
      x: tl.x + dx_top * marginX + dx_left * marginY,
      y: tl.y + dy_top * marginX + dy_left * marginY,
    };
    tr = {
      x: tr.x - dx_top * marginX + dx_left * marginY,
      y: tr.y - dy_top * marginX + dy_left * marginY,
    };
    bl = {
      x: bl.x + dx_top * marginX - dx_left * marginY,
      y: bl.y + dy_top * marginX - dy_left * marginY,
    };
    br = {
      x: br.x - dx_top * marginX - dx_left * marginY,
      y: br.y - dy_top * marginX - dy_left * marginY,
    };

    // Destination dimensions (Pokemon card ratio 63x88)
    // Let's use a high resolution for OCR
    const width = 630;
    const height = 880;

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x,
      tl.y,
      tr.x,
      tr.y,
      br.x,
      br.y,
      bl.x,
      bl.y,
    ]);

    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);

    const M = cv.getPerspectiveTransform(srcTri, dstTri);

    // Read image from canvas to Mat
    const src = cv.imread(imageCanvas);
    const dst = new cv.Mat();

    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar()
    );

    // Convert result to canvas for Tesseract
    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;

    // cv.imshow(outCanvas, dst); // Might fail if outCanvas is not in DOM or if it expects ID
    // Manual draw
    const imgData = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows);
    outCanvas.getContext('2d')?.putImageData(imgData, 0, 0);

    // Cleanup
    src.delete();
    dst.delete();
    M.delete();
    srcTri.delete();
    dstTri.delete();

    await this.processCardImage(outCanvas);
  }

  async processCardImage(cardCanvas: HTMLCanvasElement) {
    const width = cardCanvas.width;
    const height = cardCanvas.height;

    // Save the image for preview
    const cardImage = cardCanvas.toDataURL('image/jpeg');

    // Now we have a flat card image in outCanvas
    // We can crop specific regions

    // Top Region (Name, HP) - Top 15%
    const topCanvas = document.createElement('canvas');
    topCanvas.width = width;
    topCanvas.height = height * 0.15;
    topCanvas
      .getContext('2d')
      ?.drawImage(cardCanvas, 0, 0, width, height * 0.15, 0, 0, width, height * 0.15);

    // Bottom Region (Set info) - Bottom 10%
    const bottomCanvas = document.createElement('canvas');
    bottomCanvas.width = width;
    bottomCanvas.height = height * 0.1;
    bottomCanvas
      .getContext('2d')
      ?.drawImage(cardCanvas, 0, height * 0.9, width, height * 0.1, 0, 0, width, height * 0.1);

    // Save debug images to local storage or log them (as data URLs)
    const topDataUrl = topCanvas.toDataURL('image/jpeg');
    const bottomDataUrl = bottomCanvas.toDataURL('image/jpeg');

    this.ocrImages.set({ top: topDataUrl, bottom: bottomDataUrl });

    if (this.debugMode()) {
      console.log('Top Image:', topDataUrl);
      console.log('Bottom Image:', bottomDataUrl);
      this.addLog('Debug: Logged Top/Bottom images to console');
    }

    this.addLog(
      `Sending to OCR. Top: ${topCanvas.width}x${topCanvas.height}, Bottom: ${bottomCanvas.width}x${bottomCanvas.height}`
    );

    try {
      // Run OCR in parallel
      const [topResult, bottomResult] = await Promise.all([
        this.ocrService.recognize(topCanvas),
        this.ocrService.recognize(bottomCanvas),
      ]);

      this.parseOcrResult(topResult, bottomResult, cardImage);
    } catch (e) {
      console.error('OCR Failed', e);
      this.addLog(`OCR Failed: ${e}`);
    }
  }

  parseOcrResult(topResult: any, bottomResult: any, cardImage: string) {
    const info: CardInfo = { ...this.cardInfo(), image: cardImage };

    // Parse Top
    const topText = topResult?.text || '';
    const topConf = Math.round(topResult?.confidence || 0);
    this.addLog(`Raw Top OCR (${topConf}%): "${topText.replace(/\n/g, ' ')}"`);

    const topLines = (topResult?.lines || [])
      .map((l: any) => l.text.trim())
      .filter((t: string) => t.length > 0);
    console.log('Top OCR:', topLines);

    if (topLines.length > 0) {
      // Usually "Basic Pokemon Name HP 100" or similar
      // Or split across lines

      // Try to find HP
      const hpMatch =
        topLines.join(' ').match(/HP\s*(\d+)/i) || topLines.join(' ').match(/(\d+)\s*HP/i);
      if (hpMatch) {
        info.hp = hpMatch[1]; // Just the number
      }

      // Name is usually the first significant text that isn't "Basic" or "Stage"
      for (const line of topLines) {
        if (line.includes('Basic') || line.includes('Stage')) {
          info.stage = line;
          continue;
        }
        // If we haven't found a name yet, and it's not HP
        if (!info.name && !line.includes('HP')) {
          info.name = line;
        }
      }
    }

    // Parse Bottom
    const rawBottomText = bottomResult?.text || '';
    const bottomConf = Math.round(bottomResult?.confidence || 0);
    this.addLog(`Raw Bottom OCR (${bottomConf}%): "${rawBottomText.replace(/\n/g, ' ')}"`);

    const bottomLines = (bottomResult?.lines || [])
      .map((l: any) => l.text.trim())
      .filter((t: string) => t.length > 0);
    console.log('Bottom OCR:', bottomLines);

    // Look for set number
    const setMatch = bottomLines.join(' ').match(/(\d+)\/(\d+)/);
    if (setMatch) {
      info.cardNumber = setMatch[1];
      info.totalCards = setMatch[2];
    }

    // Rarity symbols are hard for OCR (Star, Circle, Diamond)
    // But sometimes they are read as text like * or . or ◆
    const bottomText = bottomLines.join(' ');
    if (bottomText.includes('★') || bottomText.includes('*')) info.rarity = 'Rare';
    else if (bottomText.includes('◆') || bottomText.includes('♦')) info.rarity = 'Uncommon';
    else if (bottomText.includes('●') || bottomText.includes('•')) info.rarity = 'Common';

    this.cardInfo.set(info);
    this.status.set('OCR Complete. Ready for next scan.');
    this.addLog(
      `OCR Complete. Found: ${info.name || 'Unknown'} (${info.cardNumber || '?'}/${
        info.totalCards || '?'
      })`
    );
  }
}
