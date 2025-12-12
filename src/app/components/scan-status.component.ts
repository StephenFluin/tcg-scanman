import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import type { CardPosition, PokemonCard } from '../../types/card.model';

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
          @if (cardPosition(); as position) {
          <div class="status-item full-width">
            <span class="label">Confidence:</span>
            <div class="confidence-bar">
              <div
                class="confidence-fill"
                [style.width.%]="position.confidence * 100"
                [class.high]="position.confidence > 0.7"
                [class.medium]="position.confidence > 0.4 && position.confidence <= 0.7"
                [class.low]="position.confidence <= 0.4"
              ></div>
              <span class="confidence-text">{{ (position.confidence * 100).toFixed(0) }}%</span>
            </div>
          </div>
          }
        </div>
      </div>

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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanStatusComponent {
  readonly markersDetected = input.required<number>();
  readonly cardPosition = input<CardPosition | null>(null);
  readonly recognizedData = input<Partial<PokemonCard>>({});

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
}
