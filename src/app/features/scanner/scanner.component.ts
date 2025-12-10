import { Component, inject, signal, viewChild, ElementRef, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraComponent } from './camera/camera.component';
import { CardDetailsComponent, CardInfo } from './card-details/card-details.component';
import { OpencvService } from '../../core/services/opencv.service';
import { OcrService } from '../../core/services/ocr.service';

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

  addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.update((logs) => [`[${timestamp}] ${message}`, ...logs].slice(0, 50));
  }

  toggleDebug() {
    this.debugMode.update((v) => !v);
    this.addLog(`Debug mode ${this.debugMode() ? 'enabled' : 'disabled'}`);
  }

  async manualScan() {
    if (!this.videoElement || !this.opencvService.isReady()) return;
    if (this.isProcessingOcr) {
      this.addLog('Scan in progress. Please wait...');
      return;
    }

    this.addLog('Manual scan triggered...');
    this.isProcessingOcr = true;

    // Define logic variables for cleanup
    let src: any, gray: any, binary: any, contours: any, hierarchy: any, kernel: any;

    try {
      const video = this.videoElement;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const cv = this.opencvService.cv;

      // Create a canvas to draw the frame
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);

      // 1. Try to detect the card using the same algorithm as processFrame
      src = cv.imread(canvas);
      gray = new cv.Mat();
      binary = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

      cv.adaptiveThreshold(
        gray,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        11,
        2
      );

      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxScore = -1;
      let bestRectPoints = null;

      const minArea = 20000;
      const cardAspectRatio = 63 / 88;
      const errorMargin = 0.2;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);

        if (area < minArea || area > width * height * 0.9) {
          cnt.delete();
          continue;
        }

        let rotatedRect = cv.minAreaRect(cnt);
        let rw = rotatedRect.size.width;
        let rh = rotatedRect.size.height;
        let aspectRatio = Math.min(rw, rh) / Math.max(rw, rh);

        if (Math.abs(aspectRatio - cardAspectRatio) < errorMargin) {
          let rectArea = rw * rh;
          let solidity = area / rectArea;

          if (solidity > 0.85) {
            let score = area * solidity;
            if (score > maxScore) {
              maxScore = score;
              bestRectPoints = cv.RotatedRect.points(rotatedRect);
            }
          }
        }
        cnt.delete();
      }

      if (bestRectPoints) {
        this.addLog(`Manual Scan: Card detected (Score: ${Math.floor(maxScore)})`);
        await this.performOcr(canvas, bestRectPoints);
      } else {
        this.addLog('Manual Scan: No card detected. Using center crop fallback.');

        // Fallback: Center Crop
        const cardRatio = 63 / 88;
        let cropHeight = height * 0.8;
        let cropWidth = cropHeight * cardRatio;

        if (cropWidth > width) {
          cropWidth = width * 0.8;
          cropHeight = cropWidth / cardRatio;
        }

        const x = (width - cropWidth) / 2;
        const y = (height - cropHeight) / 2;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx?.drawImage(canvas, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        await this.processCardImage(cropCanvas);
      }
    } catch (err) {
      console.error('Manual scan error', err);
      this.addLog(`Manual scan error: ${err}`);
    } finally {
      this.isProcessingOcr = false;
      if (src) src.delete();
      if (gray) gray.delete();
      if (binary) binary.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
      if (kernel) kernel.delete();
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

  processFrame() {
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

    let src: any, gray: any, binary: any, contours: any, hierarchy: any, approx: any;

    try {
      // 2. Draw Video to Processing Canvas (Hidden)
      const pCanvas = this.processCanvas()!.nativeElement;
      if (pCanvas.width !== video.videoWidth || pCanvas.height !== video.videoHeight) {
        pCanvas.width = video.videoWidth;
        pCanvas.height = video.videoHeight;
      }
      const pCtx = pCanvas.getContext('2d')!;
      pCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      // 3. Initialize Mats
      src = cv.imread(pCanvas);
      gray = new cv.Mat();
      binary = new cv.Mat();
      approx = new cv.Mat();

      // 4. Pre-processing - Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // Use Gaussian blur to reduce noise more aggressively
      cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 0);

      // Use adaptive threshold instead of Canny to detect the card border better
      // This works better for detecting solid rectangular objects like cards
      cv.adaptiveThreshold(
        gray,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        11,
        2
      );

      // MORPHOLOGICAL CLOSING: Fill gaps and smooth the outline
      // LARGER kernel = more aggressive smoothing of the card border
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
      cv.dilate(binary, binary, kernel);
      kernel.delete();

      // Optional: Debug View - See what the computer calculates
      if (this.debugMode()) {
        cv.imshow(pCanvas, binary);
        ctx.drawImage(pCanvas, 0, 0, canvas.width, canvas.height);
      }

      // 5. Find Contours
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxScore = 0;
      let bestPolyPoints: any[] | null = null;

      // Ignore small noise (less than 8% of screen area) and too large (more than 90%)
      // Increased minArea to avoid detecting small features within the card
      const minArea = video.videoWidth * video.videoHeight * 0.08;
      const maxArea = video.videoWidth * video.videoHeight * 0.9;

      if (this.debugMode()) {
        console.log(`[DEBUG] Total contours found: ${contours.size()}`);
        console.log(`[DEBUG] Area range: ${Math.floor(minArea)} - ${Math.floor(maxArea)}`);
      }

      // Pokemon card aspect ratio: 63mm x 88mm = 0.716
      const cardAspectRatio = 63 / 88;
      const aspectRatioTolerance = 0.25; // Tighter tolerance for better card detection

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);

        if (area < minArea || area > maxArea) {
          cnt.delete();
          continue;
        }

        if (this.debugMode()) {
          console.log(`[DEBUG] Contour ${i}: area=${Math.floor(area)}`);
        }

        // 6. Polygon Approximation
        // Epsilon balanced for 4 corners without oversimplification
        let peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

        if (this.debugMode()) {
          console.log(
            `[DEBUG] Contour ${i}: approx has ${approx.rows} corners, isConvex=${cv.isContourConvex(
              approx
            )}`
          );
        }

        // STRICT FILTER 1: Must have exactly 4 corners and be convex
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          if (this.debugMode()) {
            console.log(`[DEBUG] Contour ${i}: ✓ PASSED 4 corners test`);
          }

          // STRICT FILTER 2: Check aspect ratio using minAreaRect
          let rotatedRect = cv.minAreaRect(cnt);
          let rw = rotatedRect.size.width;
          let rh = rotatedRect.size.height;
          let aspectRatio = Math.min(rw, rh) / Math.max(rw, rh);

          if (this.debugMode()) {
            console.log(
              `[DEBUG] Contour ${i}: aspect ratio=${aspectRatio.toFixed(
                3
              )} (target=${cardAspectRatio.toFixed(3)})`
            );
          }

          if (Math.abs(aspectRatio - cardAspectRatio) < aspectRatioTolerance) {
            // STRICT FILTER 3: Check solidity (area / bounding box area)
            let rectArea = rw * rh;
            let solidity = area / rectArea;

            if (this.debugMode()) {
              console.log(`[DEBUG] Contour ${i}: solidity=${solidity.toFixed(3)}`);
            }

            if (solidity > 0.8) {
              // Score based on area and solidity - prefer larger, more solid rectangles
              let score = area * solidity;

              if (this.debugMode()) {
                console.log(`[DEBUG] Contour ${i}: ✓ PASSED all tests! Score=${Math.floor(score)}`);
              }

              if (score > maxScore) {
                maxScore = score;
                // Extract the 4 corner points from the approximated contour
                const pts = [];
                for (let j = 0; j < approx.rows; j++) {
                  pts.push({
                    x: approx.data32S[j * 2],
                    y: approx.data32S[j * 2 + 1],
                  });
                }
                bestPolyPoints = pts;
                if (this.debugMode()) {
                  console.log(`[DEBUG] New best contour: ${i}`);
                  console.log(`[DEBUG] Contour corners:`, bestPolyPoints);
                }
              }
            }
          }
        }
        cnt.delete();
      }

      // 7. Draw Detection Results
      if (!this.debugMode()) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (bestPolyPoints) {
        // Increment stability counter
        this.detectionStabilityCount++;

        // Only consider it "stable" after STABILITY_THRESHOLD consecutive detections
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
        // Reset stability counter if no detection
        this.detectionStabilityCount = 0;
        this.status.set('Scanning...');
        if (this.debugMode()) {
          console.log(`[DEBUG] ✗ NO CARD DETECTED`);
        }
      }
    } catch (err) {
      console.error('OpenCV Error', err);
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (binary) binary.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
      if (approx) approx.delete();
    }

    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
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

    const tl = top[0];
    const tr = top[1];
    const bl = bottom[0];
    const br = bottom[1];

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
      cv.BORDER_CONSTANT,
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
