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

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Hidden canvas for processing
  processCanvas = viewChild<ElementRef<HTMLCanvasElement>>('processCanvas');

  private isScanning = false;
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

    this.addLog('Manual scan triggered...');

    const video = this.videoElement;
    const width = video.videoWidth;
    const height = video.videoHeight;

    // Create a canvas to draw the frame
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    // Calculate center crop based on card aspect ratio (63/88 ~= 0.716)
    // Let's say we want to capture a good chunk of the height, maybe 80%?
    const cardRatio = 63 / 88;

    let cropHeight = height * 0.8;
    let cropWidth = cropHeight * cardRatio;

    // Ensure width doesn't exceed video width
    if (cropWidth > width) {
      cropWidth = width * 0.8;
      cropHeight = cropWidth / cardRatio;
    }

    const x = (width - cropWidth) / 2;
    const y = (height - cropHeight) / 2;

    // Crop
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx?.drawImage(canvas, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    this.processCardImage(cropCanvas);
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

    // Match canvas size to video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // OpenCV Processing
    let src: any;
    let dst: any;
    let gray: any;
    let blur: any;
    let edges: any;
    let contours: any;
    let hierarchy: any;

    try {
      // Create Mats
      // We can optimize by reusing Mats, but for now let's be safe and create/delete
      // Or use a hidden canvas to draw video frame first if cv.imread(video) doesn't work directly in all browsers
      // cv.imread usually takes an image or canvas.

      const pCanvas = this.processCanvas()!.nativeElement;
      if (pCanvas.width !== video.videoWidth || pCanvas.height !== video.videoHeight) {
        pCanvas.width = video.videoWidth;
        pCanvas.height = video.videoHeight;
      }
      const pCtx = pCanvas.getContext('2d')!;
      pCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      src = cv.imread(pCanvas);
      dst = new cv.Mat();
      gray = new cv.Mat();
      blur = new cv.Mat();
      edges = new cv.Mat();

      // Preprocessing
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      cv.Canny(blur, edges, 75, 200);

      if (this.debugMode()) {
        // Draw edges to canvas to visualize what computer sees
        // We need to convert single channel edges to RGBA for canvas
        const debugMat = new cv.Mat();
        cv.cvtColor(edges, debugMat, cv.COLOR_GRAY2RGBA);
        const imgData = new ImageData(
          new Uint8ClampedArray(debugMat.data),
          debugMat.cols,
          debugMat.rows
        );
        ctx.putImageData(imgData, 0, 0);
        debugMat.delete();
      }

      // Find Contours
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxScore = -1;
      let bestContour = null;
      let bestScoreDetails = '';

      const centerX = video.videoWidth / 2;
      const centerY = video.videoHeight / 2;

      for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);

        // Filter small noise
        if (area < 5000) {
          cnt.delete();
          continue;
        }

        let peri = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        // Looser approximation (0.04 instead of 0.02) to handle slightly curved or skewed cards
        cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

        if (approx.rows === 4) {
          // Calculate score based on area and distance from center
          // We want large area and close to center

          const moments = cv.moments(cnt, false);
          const cx = moments.m10 / moments.m00;
          const cy = moments.m01 / moments.m00;

          const dist = Math.sqrt(Math.pow(cx - centerX, 2) + Math.pow(cy - centerY, 2));

          // Heuristic: Area / (Distance + 1)
          // Or just prioritize area but penalize distance slightly
          // Let's say we want it within the center 50% of screen

          // Simple score: Area - Distance * Factor
          // Factor depends on units. Area is in pixels^2, Distance in pixels.
          // Let's normalize.

          // New Heuristic:
          // 1. Area Score: Ratio of contour area to screen area (0 to 1)
          // 2. Center Score: 1 - (Distance / MaxDistance) (0 to 1)
          // 3. Shape Score: Aspect ratio check (Pokemon cards are ~0.71)

          const screenArea = video.videoWidth * video.videoHeight;
          const areaScore = area / screenArea; // e.g. 0.5 if takes up half screen

          const maxDist = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
          const centerScore = 1 - dist / maxDist; // 1 at center, 0 at corner

          // Aspect Ratio Check
          // Use bounding rect for rough aspect ratio
          const rect = cv.boundingRect(cnt);
          const aspectRatio = rect.width / rect.height;
          const targetRatio = 0.71; // 63/88
          const ratioDiff = Math.abs(aspectRatio - targetRatio);
          const shapeScore = 1 - Math.min(ratioDiff, 1); // 1 is perfect match

          // Combined Score
          // We want big cards (area), centered (center), correct shape (shape)
          // Weight area heavily so we don't ignore big cards just because they are slightly off-center
          const score = areaScore * 0.6 + centerScore * 0.2 + shapeScore * 0.2;

          // Log details for debugging
          if (this.debugMode() && i % 5 === 0) {
            // Log occasionally to avoid spam
            console.log(
              `Contour ${i}: Area=${areaScore.toFixed(2)}, Center=${centerScore.toFixed(
                2
              )}, Shape=${shapeScore.toFixed(2)}, Score=${score.toFixed(2)}`
            );
          }

          if (score > maxScore) {
            maxScore = score;
            bestScoreDetails = `A:${areaScore.toFixed(2)} C:${centerScore.toFixed(2)} S:${shapeScore.toFixed(2)}`;
            if (bestContour) bestContour.delete();
            bestContour = approx; // Keep the approx
          } else {
            approx.delete();
          }
        } else {
          approx.delete();
        }
        cnt.delete();
      }

      if (bestContour) {
        this.status.set(`Detected! ${maxScore.toFixed(2)} [${bestScoreDetails}]`);
        // Draw contour
        // We need to convert bestContour (Mat) to points for drawing on canvas overlay
        // Or we can draw on 'dst' and show that, but we want overlay on video.

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        ctx.beginPath();

        const data = bestContour.data32S; // Int32 array of points [x1, y1, x2, y2...]
        if (data.length >= 8) {
          ctx.moveTo(data[0], data[1]);
          ctx.lineTo(data[2], data[3]);
          ctx.lineTo(data[4], data[5]);
          ctx.lineTo(data[6], data[7]);
          ctx.closePath();
          ctx.stroke();

          // Trigger OCR if enough time passed
          const now = Date.now();
          if (now - this.lastOcrTime > this.OCR_INTERVAL && !this.debugMode()) {
            this.lastOcrTime = now;
            this.status.set('Processing OCR...');
            this.addLog('Card stable. Starting OCR processing...');
            this.performOcr(pCanvas, bestContour);
          }
        }
        bestContour.delete();
      } else {
        this.status.set(`Scanning... Best: ${maxScore.toFixed(2)} [${bestScoreDetails || 'None'}]`);
      }
    } catch (err) {
      console.error('OpenCV Error', err);
    } finally {
      if (src) src.delete();
      if (dst) dst.delete();
      if (gray) gray.delete();
      if (blur) blur.delete();
      if (edges) edges.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }

    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
  }

  async performOcr(imageCanvas: HTMLCanvasElement, contour: any) {
    const cv = this.opencvService.cv;

    // 1. Get the 4 points from the contour
    // contour is a Mat of type CV_32SC2 (integer points)
    // We need to convert to float for getPerspectiveTransform

    const pointsData = contour.data32S;
    // Create array of points
    const points = [
      { x: pointsData[0], y: pointsData[1] },
      { x: pointsData[2], y: pointsData[3] },
      { x: pointsData[4], y: pointsData[5] },
      { x: pointsData[6], y: pointsData[7] },
    ];

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

    this.processCardImage(outCanvas);
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
    if (this.debugMode()) {
      console.log('Top Image:', topCanvas.toDataURL('image/jpeg'));
      console.log('Bottom Image:', bottomCanvas.toDataURL('image/jpeg'));
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
