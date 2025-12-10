import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createWorker } from 'tesseract.js';

@Injectable({
  providedIn: 'root',
})
export class OcrService {
  private worker: any;
  private platformId = inject(PLATFORM_ID);

  async init() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.worker = await createWorker('eng');
  }

  async recognize(image: string | HTMLImageElement | HTMLCanvasElement | Blob) {
    if (!isPlatformBrowser(this.platformId)) return { data: { text: '', lines: [] } };

    if (!this.worker) {
      await this.init();
    }
    const ret = await this.worker.recognize(image);
    return ret.data;
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
