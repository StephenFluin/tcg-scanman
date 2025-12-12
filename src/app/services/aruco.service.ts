import { Injectable } from '@angular/core';
import type { MarkerDetection, CardPosition } from '../../types/card.model';
// @ts-ignore
import { AR } from 'js-aruco2';

@Injectable({
  providedIn: 'root',
})
export class ArucoService {
  private detector: any = null;
  private isInitialized = false;
  private hasLoggedResolution = false;
  private readonly CARD_WIDTH_MM = 63;
  private readonly CARD_HEIGHT_MM = 88;

  constructor() {
    this.initializeDetector();
  }

  private initializeDetector(): void {
    try {
      console.log('Initializing ArUco detector...');
      // Use standard ARUCO dictionary (not MIP_36h12)
      // This matches the common 4x4, 5x5, 6x6 markers
      const params = { dictionaryName: 'ARUCO' };
      this.detector = new AR.Detector(params);
      this.isInitialized = true;
      console.log('✅ ArUco detector initialized with ARUCO dictionary');
    } catch (err) {
      console.error('Failed to initialize ArUco detector:', err);
    }
  }

  async detectMarkers(videoElement: HTMLVideoElement): Promise<MarkerDetection[]> {
    if (!this.isInitialized || !this.detector) {
      return [];
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) return [];

      if (!this.hasLoggedResolution && canvas.width > 0 && canvas.height > 0) {
        console.log(`📷 Processing at ${canvas.width}x${canvas.height} resolution`);
        this.hasLoggedResolution = true;
      }

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Preprocess image to improve marker detection on glossy/reflective surfaces
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageData = this.preprocessImage(imageData);
      
      const detectedMarkers = this.detector.detect(imageData);

      const markers: MarkerDetection[] = [];

      if (detectedMarkers && detectedMarkers.length > 0) {
        if (Math.random() < 0.1) {
          console.log(`✅ Detected ${detectedMarkers.length} ArUco markers`);
        }

        for (const marker of detectedMarkers) {
          const cornerPoints: number[][] = [];
          for (const corner of marker.corners) {
            cornerPoints.push([corner.x, corner.y]);
          }
          markers.push({ id: marker.id, corners: cornerPoints });
        }
      }

      return markers;
    } catch (err) {
      console.error('Error detecting ArUco markers:', err);
      return [];
    }
  }

  calculateCardPosition(markers: MarkerDetection[]): CardPosition | null {
    if (markers.length < 2) return null;

    try {
      const sortedMarkers = [...markers].sort((a, b) => a.id - b.id);
      const markerCenters = sortedMarkers.map((marker) => {
        const centerX = marker.corners.reduce((sum, c) => sum + c[0], 0) / 4;
        const centerY = marker.corners.reduce((sum, c) => sum + c[1], 0) / 4;
        return { x: centerX, y: centerY };
      });

      const cardCenter = {
        x: markerCenters.reduce((sum, c) => sum + c.x, 0) / markerCenters.length,
        y: markerCenters.reduce((sum, c) => sum + c.y, 0) / markerCenters.length,
      };

      const cardCorners = this.estimateCardCorners(sortedMarkers, cardCenter);
      const firstMarker = sortedMarkers[0];
      const rotation = this.calculateRotation(firstMarker);
      const scale = this.calculateScale(firstMarker);
      const confidence = Math.min(markers.length / 4, 1.0);

      return { corners: cardCorners, center: cardCenter, rotation, scale, confidence };
    } catch (err) {
      console.error('Error calculating card position:', err);
      return null;
    }
  }

  private estimateCardCorners(
    markers: MarkerDetection[],
    center: { x: number; y: number }
  ): number[][] {
    if (markers.length >= 4) {
      const allCorners = markers.flatMap((m) => m.corners);
      const minX = Math.min(...allCorners.map((c) => c[0]));
      const maxX = Math.max(...allCorners.map((c) => c[0]));
      const minY = Math.min(...allCorners.map((c) => c[1]));
      const maxY = Math.max(...allCorners.map((c) => c[1]));
      const margin = 20;
      return [
        [minX + margin, minY + margin],
        [maxX - margin, minY + margin],
        [maxX - margin, maxY - margin],
        [minX + margin, maxY - margin],
      ];
    }

    const cardWidth = 200;
    const cardHeight = (cardWidth * this.CARD_HEIGHT_MM) / this.CARD_WIDTH_MM;
    return [
      [center.x - cardWidth / 2, center.y - cardHeight / 2],
      [center.x + cardWidth / 2, center.y - cardHeight / 2],
      [center.x + cardWidth / 2, center.y + cardHeight / 2],
      [center.x - cardWidth / 2, center.y + cardHeight / 2],
    ];
  }

  private calculateRotation(marker: MarkerDetection): number {
    const corner1 = marker.corners[0];
    const corner2 = marker.corners[1];
    const dx = corner2[0] - corner1[0];
    const dy = corner2[1] - corner1[1];
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  private calculateScale(marker: MarkerDetection): number {
    const corner1 = marker.corners[0];
    const corner2 = marker.corners[1];
    const dx = corner2[0] - corner1[0];
    const dy = corner2[1] - corner1[1];
    const markerSize = Math.sqrt(dx * dx + dy * dy);
    return markerSize / 100;
  }

  extractCardRegion(
    videoElement: HTMLVideoElement,
    cardPosition: CardPosition,
    region: 'top' | 'bottom'
  ): ImageData | null {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      ctx.drawImage(videoElement, 0, 0);

      const [topLeft, topRight, , bottomLeft] = cardPosition.corners;
      let regionY: number, regionHeight: number;

      if (region === 'top') {
        regionY = topLeft[1];
        regionHeight = (bottomLeft[1] - topLeft[1]) * 0.15;
      } else {
        regionY = bottomLeft[1] - (bottomLeft[1] - topLeft[1]) * 0.15;
        regionHeight = (bottomLeft[1] - topLeft[1]) * 0.15;
      }

      const regionX = topLeft[0];
      const regionWidth = topRight[0] - topLeft[0];
      return ctx.getImageData(regionX, regionY, regionWidth, regionHeight);
    } catch (err) {
      console.error('Error extracting card region:', err);
      return null;
    }
  }
}
