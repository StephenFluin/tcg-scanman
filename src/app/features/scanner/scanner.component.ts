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

    let src: any, gray: any, blur: any, edges: any, contours: any, hierarchy: any, approx: any;

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
      blur = new cv.Mat();
      edges = new cv.Mat();
      approx = new cv.Mat();

      // 4. Pre-processing
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // HEAVY BLUR: This is critical. We use a large 7x7 kernel to "erase" the text
      // and artwork inside the card. We only want the high-contrast card border to remain.
      cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);

      // CANNY EDGE DETECTION
      // We switch back to Canny because it gives us thin lines to count corners.
      // 30/100 are relatively low thresholds to ensure we catch the card border even in lower light.
      cv.Canny(blur, edges, 30, 100);

      // DILATION
      // Thickens the edge lines to close small gaps (like where a finger might break the line).
      // This ensures the card outline is a single continuous loop.
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, edges, kernel);
      kernel.delete();

      // 5. Find Contours
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestPolyPoints: any[] | null = null;

      // Ignore small noise (less than 5% of screen area)
      const minArea = video.videoWidth * video.videoHeight * 0.05;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);

        if (area < minArea) {
          cnt.delete();
          continue;
        }

        // 6. Polygon Approximation
        // Simplify the contour. Epsilon is the "slack" allowed.
        // 0.02 (2%) of perimeter is standard for rectangle detection.
        let peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        // STRICT FILTER 1: Must have exactly 4 corners
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          // STRICT FILTER 2: Cosine Check (Squareness)
          // Ensure angles are close to 90 degrees.
          // This rejects trapezoidal shadows or weird random shapes.
          let maxCosine = 0;
          const pts = approx.data32S; // [x1, y1, x2, y2, x3, y3, x4, y4]

          for (let j = 0; j < 4; j++) {
            const p0 = { x: pts[j * 2], y: pts[j * 2 + 1] };
            const p1 = { x: pts[((j + 1) % 4) * 2], y: pts[((j + 1) % 4) * 2 + 1] };
            const p2 = { x: pts[((j + 2) % 4) * 2], y: pts[((j + 2) % 4) * 2 + 1] };

            const dx1 = p0.x - p1.x;
            const dy1 = p0.y - p1.y;
            const dx2 = p2.x - p1.x;
            const dy2 = p2.y - p1.y;

            // Dot Product to find angle
            const dot = dx1 * dx2 + dy1 * dy2;
            const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            const cosine = Math.abs(dot / (mag1 * mag2));
            maxCosine = Math.max(maxCosine, cosine);
          }

          // Cosine of 90° is 0. We allow deviation up to ~0.3 (approx 72°-108°)
          if (maxCosine < 0.3) {
            // STRICT FILTER 3: Aspect Ratio
            const rect = cv.boundingRect(approx);
            const ratio = rect.width / rect.height;

            // Pokemon cards: 0.71 (Portrait) or 1.4 (Landscape)
            const isPortrait = ratio > 0.6 && ratio < 0.85;
            const isLandscape = ratio > 1.2 && ratio < 1.6;

            if ((isPortrait || isLandscape) && area > maxArea) {
              maxArea = area;

              // Extract points for drawing
              bestPolyPoints = [
                { x: pts[0], y: pts[1] },
                { x: pts[2], y: pts[3] },
                { x: pts[4], y: pts[5] },
                { x: pts[6], y: pts[7] },
              ];
            }
          }
        }
        cnt.delete();
      }

      // 7. Draw Result
      if (bestPolyPoints) {
        this.status.set(`Card Detected! Area: ${Math.floor(maxArea)}`);

        // Clear debug drawings if any
        if (!this.debugMode()) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        ctx.beginPath();

        ctx.moveTo(bestPolyPoints[0].x, bestPolyPoints[0].y);
        ctx.lineTo(bestPolyPoints[1].x, bestPolyPoints[1].y);
        ctx.lineTo(bestPolyPoints[2].x, bestPolyPoints[2].y);
        ctx.lineTo(bestPolyPoints[3].x, bestPolyPoints[3].y);
        ctx.closePath();
        ctx.stroke();

        // Trigger OCR
        const now = Date.now();
        if (now - this.lastOcrTime > this.OCR_INTERVAL && !this.isProcessingOcr) {
          this.lastOcrTime = now;
          this.isProcessingOcr = true;
          this.performOcr(pCanvas, bestPolyPoints).finally(() => {
            this.isProcessingOcr = false;
          });
        }
      } else {
        if (!this.debugMode()) ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.status.set('Scanning...');
      }
    } catch (err) {
      console.error('OpenCV Error', err);
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blur) blur.delete();
      if (edges) edges.delete();
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
