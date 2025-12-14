import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import type { CardPosition, MarkerDetectionLog, PokemonCard } from '../../types/card.model';

/**
 * Component to display scanning status and recognized card data
 */
@Component({
  selector: 'app-scan-status',
  imports: [],
  template: `
    <div class="status-panel">
      <h2>Scan Status</h2>

      <div class="status-section">
        <h3>Detection</h3>
        <div class="status-grid">
          <div class="status-item">
            <span class="label">Markers Detected:</span>
            <span class="value" [class.detected]="markersDetected() > 0">
              {{ markersDetected() }}
            </span>
          </div>
          <div class="status-item">
            <span class="label">Card Position:</span>
            <span class="value" [class.detected]="cardPosition() !== null">
              {{ cardPosition() ? 'Detected' : 'Not Detected' }}
            </span>
          </div>
        </div>
      </div>

      @if (cardPreviewUrl()) {
      <div class="status-section">
        <h3>Card Preview (with Debug Overlays)</h3>
        <div class="card-preview">
          <img [src]="cardPreviewUrl()" alt="Extracted card preview" />
          <div class="preview-legend">
            <div class="legend-item">
              <span class="legend-color" style="background: #ff0000;"></span>
              <span>Red = Marker boundaries</span>
            </div>
            <div class="legend-item">
              <span class="legend-color" style="background: #00ff00;"></span>
              <span>Green = Calculated card corners</span>
            </div>
          </div>
          <p class="preview-info">✓ Card extracted with {{ markersDetected() }} markers</p>
          <p class="preview-note">Check console for detailed mathematical calculations</p>
          <p class="preview-note">⏸️ Scanning paused for 5 seconds</p>
        </div>
      </div>
      }

      <div class="status-section">
        <h3>Marker Detection Log</h3>
        @if (markerLogs().length > 0) {
        <div class="marker-log">
          @for (log of markerLogs().slice(0, 10); track log.timestamp) {
          <div class="log-entry">
            <span class="log-time">{{ formatTime(log.timestamp) }}</span>
            <span class="log-marker">Marker #{{ log.markerId }}</span>
            <span class="log-location"
              >({{ log.location.x.toFixed(0) }}, {{ log.location.y.toFixed(0) }})</span
            >
          </div>
          }
        </div>
        } @else {
        <p class="no-data">No markers detected yet...</p>
        }
      </div>

      @if (recognizedData().topText || recognizedData().bottomText) {
      <div class="status-section">
        <h3>OCR Results</h3>
        <div class="ocr-results">
          @if (recognizedData().topText) {
          <div class="ocr-region">
            <h4>Card Name Region (center, 10-20% from top):</h4>
            <pre class="ocr-text">{{ recognizedData().topText }}</pre>
          </div>
          } @if (recognizedData().bottomText) {
          <div class="ocr-region">
            <h4>Bottom 10% (card number/set):</h4>
            <pre class="ocr-text">{{ recognizedData().bottomText }}</pre>
          </div>
          }
        </div>
      </div>
      }

      <div class="status-section">
        <h3>Card Information</h3>
        @if (hasRecognizedData()) {
        <div class="card-info">
          @if (recognizedData().name) {
          <div class="info-row">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ recognizedData().name }}</span>
          </div>
          } @if (recognizedData().stage && recognizedData().stage !== 'Unknown') {
          <div class="info-row">
            <span class="info-label">Stage:</span>
            <span class="info-value">{{ recognizedData().stage }}</span>
          </div>
          } @if (recognizedData().hitPoints) {
          <div class="info-row">
            <span class="info-label">HP:</span>
            <span class="info-value">{{ recognizedData().hitPoints }}</span>
          </div>
          } @if (recognizedData().type && recognizedData().type !== 'Unknown') {
          <div class="info-row">
            <span class="info-label">Type:</span>
            <span class="info-value type-badge" [attr.data-type]="recognizedData().type">
              {{ recognizedData().type }}
            </span>
          </div>
          } @if (recognizedData().cardNumber) {
          <div class="info-row">
            <span class="info-label">Card Number:</span>
            <span class="info-value">
              {{ recognizedData().cardNumber }}
              @if (recognizedData().totalCards) {
              <span> / {{ recognizedData().totalCards }}</span>
              }
            </span>
          </div>
          } @if (recognizedData().rarity && recognizedData().rarity !== 'Unknown') {
          <div class="info-row">
            <span class="info-label">Rarity:</span>
            <span class="info-value rarity-badge" [attr.data-rarity]="recognizedData().rarity">
              {{ recognizedData().rarity }}
            </span>
          </div>
          }
        </div>
        } @else {
        <p class="no-data">Position card in frame to begin scanning...</p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .status-panel {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      h2 {
        margin-top: 0;
        margin-bottom: 1rem;
        color: #333;
        font-size: 1.5rem;
        border-bottom: 2px solid #cc0000;
        padding-bottom: 0.5rem;
      }

      h3 {
        margin: 1rem 0 0.5rem 0;
        color: #555;
        font-size: 1.1rem;
      }

      .status-section {
        margin-bottom: 1.5rem;
      }

      .status-section:last-child {
        margin-bottom: 0;
      }

      .status-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }

      .status-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .status-item.full-width {
        flex-direction: column;
        align-items: stretch;
      }

      .label {
        font-weight: 500;
        color: #666;
      }

      .value {
        font-weight: bold;
        color: #999;
        transition: color 0.3s;
      }

      .value.detected {
        color: #00aa00;
      }

      .confidence-bar {
        position: relative;
        height: 24px;
        background: #e0e0e0;
        border-radius: 12px;
        overflow: hidden;
        margin-top: 0.5rem;
      }

      .confidence-fill {
        height: 100%;
        transition: width 0.3s, background-color 0.3s;
        border-radius: 12px;
      }

      .confidence-fill.high {
        background: #00aa00;
      }

      .confidence-fill.medium {
        background: #ffaa00;
      }

      .confidence-fill.low {
        background: #cc0000;
      }

      .confidence-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 0.85rem;
        font-weight: bold;
        color: #333;
      }

      .ocr-results {
        background: #f5f5f5;
        border-radius: 4px;
        padding: 1rem;
      }

      .ocr-region {
        margin-bottom: 1rem;
      }

      .ocr-region:last-child {
        margin-bottom: 0;
      }

      .ocr-region h4 {
        margin: 0 0 0.5rem 0;
        color: #666;
        font-size: 0.9rem;
        font-weight: 600;
      }

      .ocr-text {
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 0.75rem;
        margin: 0;
        font-family: monospace;
        font-size: 0.85rem;
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: #333;
        max-height: 150px;
        overflow-y: auto;
      }

      .card-info {
        background: #f9f9f9;
        border-radius: 4px;
        padding: 1rem;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid #e0e0e0;
      }

      .info-row:last-child {
        border-bottom: none;
      }

      .info-label {
        font-weight: 600;
        color: #555;
      }

      .info-value {
        color: #333;
        text-align: right;
      }

      .type-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.9rem;
        font-weight: bold;
        color: white;
        background: #888;
      }

      .type-badge[data-type='Grass'] {
        background: #78c850;
      }
      .type-badge[data-type='Fire'] {
        background: #f08030;
      }
      .type-badge[data-type='Water'] {
        background: #6890f0;
      }
      .type-badge[data-type='Lightning'] {
        background: #f8d030;
        color: #333;
      }
      .type-badge[data-type='Psychic'] {
        background: #f85888;
      }
      .type-badge[data-type='Fighting'] {
        background: #c03028;
      }
      .type-badge[data-type='Darkness'] {
        background: #705848;
      }
      .type-badge[data-type='Metal'] {
        background: #b8b8d0;
      }
      .type-badge[data-type='Fairy'] {
        background: #ee99ac;
      }
      .type-badge[data-type='Dragon'] {
        background: #7038f8;
      }
      .type-badge[data-type='Colorless'] {
        background: #a8a878;
      }

      .rarity-badge {
        font-weight: bold;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
      }

      .rarity-badge[data-rarity='Common'] {
        background: #e0e0e0;
        color: #333;
      }
      .rarity-badge[data-rarity='Uncommon'] {
        background: #c0c0c0;
        color: #333;
      }
      .rarity-badge[data-rarity='Rare'] {
        background: #ffd700;
        color: #333;
      }
      .rarity-badge[data-rarity='Rare Holo'] {
        background: linear-gradient(45deg, #ffd700, #ff8c00);
        color: white;
      }
      .rarity-badge[data-rarity='Ultra Rare'] {
        background: linear-gradient(45deg, #ff1493, #8b008b);
        color: white;
      }
      .rarity-badge[data-rarity='Secret Rare'] {
        background: linear-gradient(45deg, #4169e1, #9400d3);
        color: white;
      }

      .no-data {
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 2rem;
        margin: 0;
      }

      .marker-log {
        max-height: 300px;
        overflow-y: auto;
        background: #f9f9f9;
        border-radius: 4px;
        padding: 0.5rem;
      }

      .log-entry {
        display: flex;
        gap: 0.75rem;
        padding: 0.5rem;
        border-bottom: 1px solid #e0e0e0;
        font-size: 0.85rem;
        font-family: monospace;
      }

      .log-entry:last-child {
        border-bottom: none;
      }

      .log-time {
        color: #666;
        min-width: 90px;
      }

      .log-marker {
        color: #cc0000;
        font-weight: bold;
        min-width: 80px;
      }

      .log-location {
        color: #333;
      }

      .card-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }

      .card-preview img {
        max-width: 100%;
        height: auto;
        border: 2px solid #00ff00;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }

      .preview-legend {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        background: #f5f5f5;
        padding: 0.75rem;
        border-radius: 4px;
        font-size: 0.85rem;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .legend-color {
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 1px solid #333;
      }

      .preview-info {
        color: #00aa00;
        font-weight: bold;
        margin: 0;
        text-align: center;
      }

      .preview-note {
        color: #666;
        font-size: 0.85rem;
        font-style: italic;
        margin: 0;
        text-align: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanStatusComponent {
  readonly markersDetected = input.required<number>();
  readonly cardPosition = input<CardPosition | null>(null);
  readonly recognizedData = input<Partial<PokemonCard>>({});
  readonly markerLogs = input<MarkerDetectionLog[]>([]);
  readonly cardPreviewUrl = input<string | null>(null);

  protected hasRecognizedData(): boolean {
    const data = this.recognizedData();
    return !!(
      data.name ||
      (data.stage && data.stage !== 'Unknown') ||
      data.hitPoints ||
      (data.type && data.type !== 'Unknown') ||
      data.cardNumber ||
      (data.rarity && data.rarity !== 'Unknown')
    );
  }

  protected formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 1,
    });
  }
}
