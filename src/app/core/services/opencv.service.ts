import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare var cv: any;

@Injectable({
  providedIn: 'root',
})
export class OpencvService {
  readonly isReady = signal(false);
  private platformId = inject(PLATFORM_ID);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Check if cv is already loaded
    if (typeof cv !== 'undefined' && cv.getBuildInformation) {
      console.log('OpenCV loaded');
      this.isReady.set(true);
    } else {
      const checkCv = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.getBuildInformation) {
          clearInterval(checkCv);
          console.log('OpenCV initialized');
          this.isReady.set(true);
        }
      }, 100);
    }
  }

  get cv() {
    if (!isPlatformBrowser(this.platformId)) return null;
    return typeof cv !== 'undefined' ? cv : null;
  }
}
