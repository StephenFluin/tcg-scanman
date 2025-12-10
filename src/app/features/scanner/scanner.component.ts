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
    `,
  ],
})
export class ScannerComponent implements OnDestroy {
  private opencvService = inject(OpencvService);
  private ocrService = inject(OcrService);

  cardInfo = signal<CardInfo | null>(null);
  status = signal<string>('Initializing...');
  logs = signal<string[]>([]);

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

      // Find Contours
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestContour = null;

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
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
          // Check aspect ratio?
          // For now, just finding the largest quad is a good start
          if (area > maxArea) {
            maxArea = area;
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
        this.status.set('Card Detected! Tracking...');
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
          if (now - this.lastOcrTime > this.OCR_INTERVAL) {
            this.lastOcrTime = now;
            this.status.set('Processing OCR...');
            this.addLog('Card stable. Starting OCR processing...');
            this.performOcr(pCanvas, bestContour);
          }
        }
        bestContour.delete();
      } else {
        this.status.set('Scanning... No card detected.');
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

    // Save the image for preview
    const cardImage = outCanvas.toDataURL('image/jpeg');

    // Cleanup
    src.delete();
    dst.delete();
    M.delete();
    srcTri.delete();
    dstTri.delete();

    // Now we have a flat card image in outCanvas
    // We can crop specific regions

    // Top Region (Name, HP) - Top 15%
    const topCanvas = document.createElement('canvas');
    topCanvas.width = width;
    topCanvas.height = height * 0.15;
    topCanvas
      .getContext('2d')
      ?.drawImage(outCanvas, 0, 0, width, height * 0.15, 0, 0, width, height * 0.15);

    // Bottom Region (Set info) - Bottom 10%
    const bottomCanvas = document.createElement('canvas');
    bottomCanvas.width = width;
    bottomCanvas.height = height * 0.1;
    bottomCanvas
      .getContext('2d')
      ?.drawImage(outCanvas, 0, height * 0.9, width, height * 0.1, 0, 0, width, height * 0.1);

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
    const topLines = topResult.lines
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
    const bottomLines = bottomResult.lines
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
