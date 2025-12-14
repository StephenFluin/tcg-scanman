import { Component, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { CameraPreviewComponent } from '../components/camera-preview.component';
import { ScanStatusComponent } from '../components/scan-status.component';

/**
 * Main scanner page that integrates camera preview and scan status
 */
@Component({
  selector: 'app-scanner',
  imports: [CameraPreviewComponent, ScanStatusComponent],
  template: `
    <div class="scanner-page">
      <div class="scanner-layout">
        <div class="preview-column">
          <app-camera-preview #cameraPreview />
        </div>
        <div class="status-column">
          <app-scan-status
            [markersDetected]="cameraPreview.markers().length"
            [cardPosition]="cameraPreview.cardPosition()"
            [recognizedData]="cameraPreview.recognizedData()"
            [markerLogs]="cameraPreview.markerLogs()"
            [cardPreviewUrl]="cameraPreview.cardPreviewUrl()"
          />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .scanner-page {
        padding: 2rem 1rem;
      }

      .scanner-layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        max-width: 1400px;
        margin: 0 auto;
      }

      @media (min-width: 768px) {
        .scanner-layout {
          grid-template-columns: 2fr 1fr;
        }
      }

      .preview-column {
        width: 100%;
      }

      .status-column {
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerPage {
  readonly cameraPreview = viewChild.required<CameraPreviewComponent>('cameraPreview');
}
