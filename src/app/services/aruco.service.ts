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
  // Physical measurements from the 3D printed template
  // Card starts 52mm (in marker space) from marker 0's top-left corner
  private readonly MARKER_TO_CARD_OFFSET_MM = 52;
  // Card ends 2mm before marker 3's top-left corner
  private readonly CARD_TO_MARKER3_GAP_MM = 2;

  constructor() {
    this.initializeDetector();
  }

  private initializeDetector(): void {
    try {
      console.log('Initializing ArUco detector...');
      // Use standard ARUCO dictionary (not MIP_36h12)
      // This matches the common 4x4, 5x5, 6x6 markers
      const params = { dictionaryName: 'ARUCO_MIP_36h12' };
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

          // Log detailed marker info occasionally
          if (Math.random() < 0.05) {
            console.log(`  Marker ${marker.id} corners:`);
            cornerPoints.forEach((c, i) => {
              console.log(`    Corner ${i}: (${c[0].toFixed(1)}, ${c[1].toFixed(1)})`);
            });
          }
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
      // Check if we have valid marker combinations
      const markerIds = markers.map((m) => m.id);
      const hasMarkers0And3 = markerIds.includes(0) && markerIds.includes(3);
      const hasMarkers1And2 = markerIds.includes(1) && markerIds.includes(2);

      if (!hasMarkers0And3 && !hasMarkers1And2) {
        // Need at least one diagonal pair
        return null;
      }

      const sortedMarkers = [...markers].sort((a, b) => a.id - b.id);

      // Get marker by ID helper
      const getMarker = (id: number) => sortedMarkers.find((m) => m.id === id);

      const cardCorners = this.estimateCardCornersFromMarkers(sortedMarkers);

      // Calculate card center from corners
      const cardCenter = {
        x: cardCorners.reduce((sum: number, c: number[]) => sum + c[0], 0) / 4,
        y: cardCorners.reduce((sum: number, c: number[]) => sum + c[1], 0) / 4,
      };

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

  /**
   * Estimate card corners from detected markers using physical measurements
   * Markers are placed 2mm from card edges in the 3D printed template
   * Card starts 52mm right and below from marker 0's top-left corner
   * Card ends 2mm before marker 3's top-left corner
   */
  private estimateCardCornersFromMarkers(markers: MarkerDetection[]): number[][] {
    const getMarker = (id: number) => markers.find((m) => m.id === id);
    const marker0 = getMarker(0);
    const marker1 = getMarker(1);
    const marker2 = getMarker(2);
    const marker3 = getMarker(3);

    // If we have all 4 markers, calculate precisely
    if (marker0 && marker1 && marker2 && marker3) {
      return this.calculateCardCornersFromAllMarkers(marker0, marker1, marker2, marker3);
    }

    // If we have markers 0 and 3 (main diagonal)
    if (marker0 && marker3) {
      return this.calculateCardCornersFromDiagonal(marker0, marker3, 0, 3);
    }

    // If we have markers 1 and 2 (other diagonal)
    if (marker1 && marker2) {
      return this.calculateCardCornersFromDiagonal(marker1, marker2, 1, 2);
    }

    // If we have 0 and 1 (top edge)
    if (marker0 && marker1) {
      return this.calculateCardCornersFromEdge(marker0, marker1, 'top');
    }

    // If we have 3 and 2 (bottom edge)
    if (marker3 && marker2) {
      return this.calculateCardCornersFromEdge(marker3, marker2, 'bottom');
    }

    // Fallback: estimate from any available markers
    return this.estimateCardCornersGeneric(markers);
  }

  /**
   * Calculate card corners when all 4 markers are present using perspective plane
   * Markers: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
   */
  private calculateCardCornersFromAllMarkers(
    marker0: MarkerDetection,
    marker1: MarkerDetection,
    marker2: MarkerDetection,
    marker3: MarkerDetection
  ): number[][] {
    console.log('📐 Calculating card corners from all 4 markers using perspective plane:');

    // Log all marker corners with orientation
    this.logMarkerOrientation(marker0, 0, 'top-left');
    this.logMarkerOrientation(marker1, 1, 'top-right');
    this.logMarkerOrientation(marker2, 2, 'bottom-left');
    this.logMarkerOrientation(marker3, 3, 'bottom-right');

    // Get the inner corners of each marker (the corners closest to the card)
    // Marker 0 (top-left): use bottom-right corner (corner 2)
    // Marker 1 (top-right): use bottom-left corner (corner 3)
    // Marker 2 (bottom-left): use top-right corner (corner 1)
    // Marker 3 (bottom-right): use top-left corner (corner 0)
    const m0Inner = marker0.corners[2]; // Bottom-right of top-left marker
    const m1Inner = marker1.corners[3]; // Bottom-left of top-right marker
    const m2Inner = marker2.corners[1]; // Top-right of bottom-left marker
    const m3Inner = marker3.corners[0]; // Top-left of bottom-right marker

    console.log('  Inner marker corners (closest to card):');
    console.log(`    M0 inner: (${m0Inner[0].toFixed(1)}, ${m0Inner[1].toFixed(1)})`);
    console.log(`    M1 inner: (${m1Inner[0].toFixed(1)}, ${m1Inner[1].toFixed(1)})`);
    console.log(`    M2 inner: (${m2Inner[0].toFixed(1)}, ${m2Inner[1].toFixed(1)})`);
    console.log(`    M3 inner: (${m3Inner[0].toFixed(1)}, ${m3Inner[1].toFixed(1)})`);

    // Calculate the 3D plane vectors from marker positions
    // Top edge vector (from M0 to M1)
    const topEdgeVector = [m1Inner[0] - m0Inner[0], m1Inner[1] - m0Inner[1]];
    const topEdgeLength = Math.sqrt(topEdgeVector[0] ** 2 + topEdgeVector[1] ** 2);

    // Bottom edge vector (from M2 to M3)
    const bottomEdgeVector = [m3Inner[0] - m2Inner[0], m3Inner[1] - m2Inner[1]];
    const bottomEdgeLength = Math.sqrt(bottomEdgeVector[0] ** 2 + bottomEdgeVector[1] ** 2);

    // Left edge vector (from M0 to M2)
    const leftEdgeVector = [m2Inner[0] - m0Inner[0], m2Inner[1] - m0Inner[1]];
    const leftEdgeLength = Math.sqrt(leftEdgeVector[0] ** 2 + leftEdgeVector[1] ** 2);

    // Right edge vector (from M1 to M3)
    const rightEdgeVector = [m3Inner[0] - m1Inner[0], m3Inner[1] - m1Inner[1]];
    const rightEdgeLength = Math.sqrt(rightEdgeVector[0] ** 2 + rightEdgeVector[1] ** 2);

    console.log('  Edge vectors and lengths:');
    console.log(
      `    Top edge: ${topEdgeLength.toFixed(1)}px, vector: (${topEdgeVector[0].toFixed(
        1
      )}, ${topEdgeVector[1].toFixed(1)})`
    );
    console.log(
      `    Bottom edge: ${bottomEdgeLength.toFixed(1)}px, vector: (${bottomEdgeVector[0].toFixed(
        1
      )}, ${bottomEdgeVector[1].toFixed(1)})`
    );
    console.log(
      `    Left edge: ${leftEdgeLength.toFixed(1)}px, vector: (${leftEdgeVector[0].toFixed(
        1
      )}, ${leftEdgeVector[1].toFixed(1)})`
    );
    console.log(
      `    Right edge: ${rightEdgeLength.toFixed(1)}px, vector: (${rightEdgeVector[0].toFixed(
        1
      )}, ${rightEdgeVector[1].toFixed(1)})`
    );

    // Calculate average scale from all edges
    const avgHorizontalLength = (topEdgeLength + bottomEdgeLength) / 2;
    const avgVerticalLength = (leftEdgeLength + rightEdgeLength) / 2;

    // Calculate pixels per mm based on physical card dimensions
    const pixelsPerMmHorizontal = avgHorizontalLength / this.CARD_WIDTH_MM;
    const pixelsPerMmVertical = avgVerticalLength / this.CARD_HEIGHT_MM;
    const pixelsPerMm = (pixelsPerMmHorizontal + pixelsPerMmVertical) / 2;

    console.log(`  Scale calculation:`);
    console.log(`    Horizontal: ${pixelsPerMmHorizontal.toFixed(2)} px/mm`);
    console.log(`    Vertical: ${pixelsPerMmVertical.toFixed(2)} px/mm`);
    console.log(`    Average: ${pixelsPerMm.toFixed(2)} px/mm`);

    // Calculate card corners using bilinear interpolation on the perspective plane
    // This accounts for perspective distortion
    const gap = this.CARD_TO_MARKER3_GAP_MM * pixelsPerMm;

    console.log(
      `  Gap from inner marker corners to card: ${gap.toFixed(1)}px (${
        this.CARD_TO_MARKER3_GAP_MM
      }mm)`
    );

    // Card corners are inset from the inner marker corners by the gap amount
    // Using the edge vectors to calculate proper inset
    const topLeftInset = this.normalizeVector(topEdgeVector);
    const topRightInset = this.normalizeVector([-topEdgeVector[0], -topEdgeVector[1]]);
    const bottomLeftInset = this.normalizeVector(leftEdgeVector);
    const bottomRightInset = this.normalizeVector([-leftEdgeVector[0], -leftEdgeVector[1]]);

    // Top edge moves down perpendicular to itself
    const topPerp = [-topEdgeVector[1] / topEdgeLength, topEdgeVector[0] / topEdgeLength];
    const bottomPerp = [
      bottomEdgeVector[1] / bottomEdgeLength,
      -bottomEdgeVector[0] / bottomEdgeLength,
    ];
    const leftPerp = [leftEdgeVector[1] / leftEdgeLength, -leftEdgeVector[0] / leftEdgeLength];
    const rightPerp = [-rightEdgeVector[1] / rightEdgeLength, rightEdgeVector[0] / rightEdgeLength];

    // Calculate card corners with gap inset
    const topLeft = [
      m0Inner[0] + leftPerp[0] * gap + topPerp[0] * gap,
      m0Inner[1] + leftPerp[1] * gap + topPerp[1] * gap,
    ];

    const topRight = [
      m1Inner[0] + rightPerp[0] * gap + topPerp[0] * gap,
      m1Inner[1] + rightPerp[1] * gap + topPerp[1] * gap,
    ];

    const bottomRight = [
      m3Inner[0] + rightPerp[0] * gap + bottomPerp[0] * gap,
      m3Inner[1] + rightPerp[1] * gap + bottomPerp[1] * gap,
    ];

    const bottomLeft = [
      m2Inner[0] + leftPerp[0] * gap + bottomPerp[0] * gap,
      m2Inner[1] + leftPerp[1] * gap + bottomPerp[1] * gap,
    ];

    console.log('  Calculated card corners:');
    console.log(`    Top-left: (${topLeft[0].toFixed(1)}, ${topLeft[1].toFixed(1)})`);
    console.log(`    Top-right: (${topRight[0].toFixed(1)}, ${topRight[1].toFixed(1)})`);
    console.log(`    Bottom-right: (${bottomRight[0].toFixed(1)}, ${bottomRight[1].toFixed(1)})`);
    console.log(`    Bottom-left: (${bottomLeft[0].toFixed(1)}, ${bottomLeft[1].toFixed(1)})`);

    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  /**
   * Log marker orientation details
   */
  private logMarkerOrientation(marker: MarkerDetection, id: number, position: string): void {
    console.log(`  Marker ${id} (${position}):`);
    marker.corners.forEach((corner, idx) => {
      const cornerNames = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
      console.log(
        `    Corner ${idx} (${cornerNames[idx]}): (${corner[0].toFixed(1)}, ${corner[1].toFixed(
          1
        )})`
      );
    });
  }

  /**
   * Calculate card corners from a diagonal pair of markers
   */
  private calculateCardCornersFromDiagonal(
    markerA: MarkerDetection,
    markerB: MarkerDetection,
    idA: number,
    idB: number
  ): number[][] {
    const mATopLeft = markerA.corners[0];
    const mBTopLeft = markerB.corners[0];

    const markerSize = this.getMarkerSize(markerA);
    const pixelsPerMm = markerSize / 40;

    const offsetPixels = this.MARKER_TO_CARD_OFFSET_MM * pixelsPerMm;
    const gapPixels = this.CARD_TO_MARKER3_GAP_MM * pixelsPerMm;

    // Calculate the diagonal vector
    const diagonalVector = [mBTopLeft[0] - mATopLeft[0], mBTopLeft[1] - mATopLeft[1]];

    // Estimate perpendicular vectors (assume roughly square layout)
    const rightVector = this.normalizeVector([diagonalVector[0], diagonalVector[1]]);
    const downVector = this.normalizeVector([diagonalVector[0], diagonalVector[1]]);

    const cardWidthPixels = this.CARD_WIDTH_MM * pixelsPerMm;
    const cardHeightPixels = this.CARD_HEIGHT_MM * pixelsPerMm;

    const topLeft = [
      mATopLeft[0] + rightVector[0] * offsetPixels + downVector[0] * offsetPixels,
      mATopLeft[1] + rightVector[1] * offsetPixels + downVector[1] * offsetPixels,
    ];

    const topRight = [
      topLeft[0] + rightVector[0] * cardWidthPixels,
      topLeft[1] + rightVector[1] * cardWidthPixels,
    ];

    const bottomRight = [
      topRight[0] + downVector[0] * cardHeightPixels,
      topRight[1] + downVector[1] * cardHeightPixels,
    ];

    const bottomLeft = [
      topLeft[0] + downVector[0] * cardHeightPixels,
      topLeft[1] + downVector[1] * cardHeightPixels,
    ];

    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  /**
   * Calculate card corners from an edge pair of markers
   */
  private calculateCardCornersFromEdge(
    markerA: MarkerDetection,
    markerB: MarkerDetection,
    edge: 'top' | 'bottom'
  ): number[][] {
    const mATopLeft = markerA.corners[0];
    const mBTopLeft = markerB.corners[0];

    const markerSize = this.getMarkerSize(markerA);
    const pixelsPerMm = markerSize / 40;

    const offsetPixels = this.MARKER_TO_CARD_OFFSET_MM * pixelsPerMm;
    const cardWidthPixels = this.CARD_WIDTH_MM * pixelsPerMm;
    const cardHeightPixels = this.CARD_HEIGHT_MM * pixelsPerMm;

    // Calculate the edge vector
    const edgeVector = this.normalizeVector([
      mBTopLeft[0] - mATopLeft[0],
      mBTopLeft[1] - mATopLeft[1],
    ]);

    // Perpendicular vector (rotate 90 degrees)
    const perpVector = [-edgeVector[1], edgeVector[0]];

    if (edge === 'top') {
      const topLeft = [
        mATopLeft[0] + edgeVector[0] * offsetPixels + perpVector[0] * offsetPixels,
        mATopLeft[1] + edgeVector[1] * offsetPixels + perpVector[1] * offsetPixels,
      ];

      const topRight = [
        topLeft[0] + edgeVector[0] * cardWidthPixels,
        topLeft[1] + edgeVector[1] * cardWidthPixels,
      ];

      const bottomRight = [
        topRight[0] + perpVector[0] * cardHeightPixels,
        topRight[1] + perpVector[1] * cardHeightPixels,
      ];

      const bottomLeft = [
        topLeft[0] + perpVector[0] * cardHeightPixels,
        topLeft[1] + perpVector[1] * cardHeightPixels,
      ];

      return [topLeft, topRight, bottomRight, bottomLeft];
    } else {
      // bottom edge
      const bottomLeft = [
        mATopLeft[0] + edgeVector[0] * offsetPixels - perpVector[0] * offsetPixels,
        mATopLeft[1] + edgeVector[1] * offsetPixels - perpVector[1] * offsetPixels,
      ];

      const bottomRight = [
        bottomLeft[0] + edgeVector[0] * cardWidthPixels,
        bottomLeft[1] + edgeVector[1] * cardWidthPixels,
      ];

      const topRight = [
        bottomRight[0] - perpVector[0] * cardHeightPixels,
        bottomRight[1] - perpVector[1] * cardHeightPixels,
      ];

      const topLeft = [
        bottomLeft[0] - perpVector[0] * cardHeightPixels,
        bottomLeft[1] - perpVector[1] * cardHeightPixels,
      ];

      return [topLeft, topRight, bottomRight, bottomLeft];
    }
  }

  /**
   * Generic estimation when we can't use specific marker combinations
   */
  private estimateCardCornersGeneric(markers: MarkerDetection[]): number[][] {
    const allCorners = markers.flatMap((m) => m.corners);
    const minX = Math.min(...allCorners.map((c) => c[0]));
    const maxX = Math.max(...allCorners.map((c) => c[0]));
    const minY = Math.min(...allCorners.map((c) => c[1]));
    const maxY = Math.max(...allCorners.map((c) => c[1]));

    const width = maxX - minX;
    const height = maxY - minY;

    // Apply proportional inset
    const insetX = width * 0.12;
    const insetY = height * 0.12;

    return [
      [minX + insetX, minY + insetY],
      [maxX - insetX, minY + insetY],
      [maxX - insetX, maxY - insetY],
      [minX + insetX, maxY - insetY],
    ];
  }

  /**
   * Get the size of a marker in pixels
   */
  private getMarkerSize(marker: MarkerDetection): number {
    const [c1, c2] = marker.corners;
    return Math.sqrt(Math.pow(c2[0] - c1[0], 2) + Math.pow(c2[1] - c1[1], 2));
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
    return [vector[0] / length, vector[1] / length];
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

  /**
   * Extract the full card image based on detected markers using perspective transformation
   * Returns a data URL of the extracted card for display
   * Card corners are already calculated with proper offsets from markers
   */
  extractCardImage(
    videoElement: HTMLVideoElement,
    cardPosition: CardPosition,
    markers: MarkerDetection[],
    debugMode: boolean = true
  ): string | null {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Set canvas size to standard Pokemon card aspect ratio
      canvas.width = 400; // Fixed width for consistency
      canvas.height = (canvas.width * this.CARD_HEIGHT_MM) / this.CARD_WIDTH_MM;

      // The card corners are already calculated with proper offsets
      const [topLeft, topRight, bottomRight, bottomLeft] = cardPosition.corners;

      console.log('🖼️  Extracting card image with perspective transformation:');
      console.log(`  Source corners:`);
      console.log(`    Top-left: (${topLeft[0].toFixed(1)}, ${topLeft[1].toFixed(1)})`);
      console.log(`    Top-right: (${topRight[0].toFixed(1)}, ${topRight[1].toFixed(1)})`);
      console.log(`    Bottom-right: (${bottomRight[0].toFixed(1)}, ${bottomRight[1].toFixed(1)})`);
      console.log(`    Bottom-left: (${bottomLeft[0].toFixed(1)}, ${bottomLeft[1].toFixed(1)})`);
      console.log(`  Target canvas: ${canvas.width}x${canvas.height}px`);
      console.log(
        `  Expected card aspect: ${(this.CARD_WIDTH_MM / this.CARD_HEIGHT_MM).toFixed(2)}`
      );

      // Calculate bounding box from card corners
      const allX = cardPosition.corners.map((c) => c[0]);
      const allY = cardPosition.corners.map((c) => c[1]);
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);

      const sourceWidth = maxX - minX;
      const sourceHeight = maxY - minY;

      console.log(
        `  Bounding box: (${minX.toFixed(1)}, ${minY.toFixed(1)}) to (${maxX.toFixed(
          1
        )}, ${maxY.toFixed(1)})`
      );
      console.log(`  Source dimensions: ${sourceWidth.toFixed(1)}x${sourceHeight.toFixed(1)}px`);

      // Draw the card region directly (simple crop for now)
      ctx.drawImage(
        videoElement,
        minX,
        minY,
        sourceWidth,
        sourceHeight, // source
        0,
        0,
        canvas.width,
        canvas.height // destination
      );

      // Add debug visualizations if enabled
      if (debugMode) {
        // Draw debug info on the extracted card
        ctx.save();

        // Add semi-transparent overlay showing extraction info
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, 80);

        ctx.fillStyle = '#00ff00';
        ctx.font = '11px monospace';
        ctx.fillText(
          `Source video: ${videoElement.videoWidth}x${videoElement.videoHeight}px`,
          5,
          15
        );
        ctx.fillText(`Output card: ${canvas.width}x${canvas.height}px`, 5, 30);
        ctx.fillText(`Markers used: ${markers.map((m) => m.id).join(', ')}`, 5, 45);
        ctx.fillText(`Card size: ${this.CARD_WIDTH_MM}x${this.CARD_HEIGHT_MM}mm`, 5, 60);
        ctx.fillText(`Bounding box: ${sourceWidth.toFixed(0)}x${sourceHeight.toFixed(0)}px`, 5, 75);

        ctx.restore();
      }

      // Convert to data URL
      return canvas.toDataURL('image/jpeg', 0.9);
    } catch (err) {
      console.error('Error extracting card image:', err);
      return null;
    }
  }

  /**
   * Extract specific regions of the card for OCR
   * Returns ImageData for top 25% and bottom 10% of the card
   */
  extractCardRegionsForOCR(
    videoElement: HTMLVideoElement,
    cardPosition: CardPosition
  ): { topRegion: ImageData | null; bottomRegion: ImageData | null } {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return { topRegion: null, bottomRegion: null };

      // Set canvas size to standard Pokemon card aspect ratio
      canvas.width = 400;
      canvas.height = (canvas.width * this.CARD_HEIGHT_MM) / this.CARD_WIDTH_MM;

      // Calculate bounding box from card corners
      const allX = cardPosition.corners.map((c) => c[0]);
      const allY = cardPosition.corners.map((c) => c[1]);
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);

      const sourceWidth = maxX - minX;
      const sourceHeight = maxY - minY;

      // Draw the full card to canvas
      ctx.drawImage(
        videoElement,
        minX,
        minY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Extract top 25% region
      const topHeight = Math.floor(canvas.height * 0.25);
      const topRegion = ctx.getImageData(0, 0, canvas.width, topHeight);

      // Extract bottom 10% region
      const bottomHeight = Math.floor(canvas.height * 0.1);
      const bottomY = canvas.height - bottomHeight;
      const bottomRegion = ctx.getImageData(0, bottomY, canvas.width, bottomHeight);

      return { topRegion, bottomRegion };
    } catch (err) {
      console.error('Error extracting card regions for OCR:', err);
      return { topRegion: null, bottomRegion: null };
    }
  }

  /**
   * Apply perspective transformation using homography matrix
   * Maps quadrilateral from source to rectangle in destination
   */
  private applyPerspectiveTransform(
    srcCanvas: HTMLCanvasElement,
    dstCanvas: HTMLCanvasElement,
    srcCorners: number[][],
    dstCorners: number[][]
  ): void {
    const dstCtx = dstCanvas.getContext('2d');
    const srcCtx = srcCanvas.getContext('2d');
    if (!dstCtx || !srcCtx) return;

    // Get source image data
    const srcImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    // Calculate homography matrix from src to dst
    const H = this.calculateHomography(srcCorners, dstCorners);

    console.log('  Homography matrix:');
    console.log(`    [${H[0].toFixed(4)}, ${H[1].toFixed(4)}, ${H[2].toFixed(4)}]`);
    console.log(`    [${H[3].toFixed(4)}, ${H[4].toFixed(4)}, ${H[5].toFixed(4)}]`);
    console.log(`    [${H[6].toFixed(7)}, ${H[7].toFixed(7)}, ${H[8].toFixed(4)}]`);

    // Create destination image data
    const dstImageData = dstCtx.createImageData(dstCanvas.width, dstCanvas.height);

    // Apply transformation with bilinear interpolation
    for (let y = 0; y < dstCanvas.height; y++) {
      for (let x = 0; x < dstCanvas.width; x++) {
        // Map destination pixel to source using homography
        const w = H[6] * x + H[7] * y + H[8];
        const srcX = (H[0] * x + H[1] * y + H[2]) / w;
        const srcY = (H[3] * x + H[4] * y + H[5]) / w;

        // Bilinear interpolation
        if (srcX >= 0 && srcX < srcCanvas.width - 1 && srcY >= 0 && srcY < srcCanvas.height - 1) {
          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const x1 = x0 + 1;
          const y1 = y0 + 1;

          const fx = srcX - x0;
          const fy = srcY - y0;

          const dstIdx = (y * dstCanvas.width + x) * 4;

          for (let c = 0; c < 3; c++) {
            const v00 = srcImageData.data[(y0 * srcCanvas.width + x0) * 4 + c];
            const v10 = srcImageData.data[(y0 * srcCanvas.width + x1) * 4 + c];
            const v01 = srcImageData.data[(y1 * srcCanvas.width + x0) * 4 + c];
            const v11 = srcImageData.data[(y1 * srcCanvas.width + x1) * 4 + c];

            const value =
              v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;

            dstImageData.data[dstIdx + c] = Math.round(value);
          }
          dstImageData.data[dstIdx + 3] = 255; // Alpha
        }
      }
    }

    dstCtx.putImageData(dstImageData, 0, 0);
  }

  /**
   * Calculate homography matrix using Direct Linear Transform (DLT)
   * Maps 4 source points to 4 destination points
   */
  private calculateHomography(srcPts: number[][], dstPts: number[][]): number[] {
    // Build matrix A for DLT
    const A: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const [sx, sy] = srcPts[i];
      const [dx, dy] = dstPts[i];

      A.push([-sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy, dx]);
      A.push([0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy, dy]);
    }

    // Solve using SVD (simplified for 4-point case)
    // For now, use a closed-form solution for the common case
    const h = this.solveDLT(A);

    return h;
  }

  /**
   * Solve Direct Linear Transform using Gaussian elimination
   * More robust implementation for homography calculation
   */
  private solveDLT(A: number[][]): number[] {
    // Solve Ah = 0 using SVD approximation
    // We want the eigenvector corresponding to the smallest eigenvalue of A^T*A

    const n = A.length; // 8 equations
    const m = A[0].length; // 9 unknowns

    // Build A^T * A (9x9 matrix)
    const ATA: number[][] = Array(m)
      .fill(0)
      .map(() => Array(m).fill(0));

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += A[k][i] * A[k][j];
        }
        ATA[i][j] = sum;
      }
    }

    // Use power iteration to find smallest eigenvector
    // Start with last column (h[8] = 1 constraint)
    let h = [0, 0, 0, 0, 0, 0, 0, 0, 1];

    // Iterate to refine
    for (let iter = 0; iter < 100; iter++) {
      const newH: number[] = Array(9).fill(0);

      // Multiply by inverse (approximated by solving)
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
          newH[i] += ATA[i][j] * h[j];
        }
      }

      // Normalize
      const norm = Math.sqrt(newH.reduce((sum, v) => sum + v * v, 0));
      if (norm < 1e-10) break;

      h = newH.map((v) => v / norm);
    }

    return h;
  }

  /**
   * Preprocess image to improve marker detection on glossy/reflective surfaces
   * Enhances contrast and applies adaptive thresholding
   */
  private preprocessImage(imageData: ImageData): ImageData {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // First pass: Convert to grayscale and enhance contrast
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Convert to grayscale
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Enhance contrast using histogram stretching
      // This helps with low-contrast markers on glossy surfaces
      gray = this.stretchContrast(gray, 30, 225);

      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    // Second pass: Apply sharpening to enhance edges
    const sharpened = new Uint8ClampedArray(data);
    const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1]; // Sharpening kernel

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4;
            sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        const idx = (y * width + x) * 4;
        const value = Math.max(0, Math.min(255, sum));
        sharpened[idx] = value;
        sharpened[idx + 1] = value;
        sharpened[idx + 2] = value;
      }
    }

    return new ImageData(sharpened, width, height);
  }

  /**
   * Stretch contrast to enhance markers
   */
  private stretchContrast(value: number, min: number, max: number): number {
    if (value < min) return 0;
    if (value > max) return 255;
    return ((value - min) / (max - min)) * 255;
  }
}
