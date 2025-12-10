import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CardInfo {
  name?: string;
  hp?: string;
  type?: string;
  stage?: string;
  cardNumber?: string;
  totalCards?: string;
  rarity?: string;
  image?: string;
}

@Component({
  selector: 'app-card-details',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card-details">
      <h2>Card Details</h2>
      <div class="status-bar">Status: {{ status() }}</div>

      @if (info()) { @if (info()?.image) {
      <div class="card-preview">
        <img [src]="info()?.image" alt="Scanned Card" />
      </div>
      }
      <div class="detail-row">
        <span class="label">Name:</span>
        <span class="value">{{ info()?.name || 'Scanning...' }}</span>
      </div>
      <div class="detail-row">
        <span class="label">HP:</span>
        <span class="value">{{ info()?.hp || '...' }}</span>
      </div>
      <div class="detail-row">
        <span class="label">Type:</span>
        <span class="value">{{ info()?.type || '...' }}</span>
      </div>
      <div class="detail-row">
        <span class="label">Stage:</span>
        <span class="value">{{ info()?.stage || '...' }}</span>
      </div>
      <hr />
      <div class="detail-row">
        <span class="label">Number:</span>
        <span class="value">{{ info()?.cardNumber || '?' }} / {{ info()?.totalCards || '?' }}</span>
      </div>
      <div class="detail-row">
        <span class="label">Rarity:</span>
        <span class="value">{{ info()?.rarity || '...' }}</span>
      </div>
      } @else {
      <p>Point camera at a Pokemon card...</p>
      <p class="hint">Ensure good lighting and hold the card steady.</p>
      } @if (ocrImages().top || ocrImages().bottom) {
      <div class="ocr-preview">
        <h3>OCR Debug</h3>
        <div class="ocr-images">
          @if (ocrImages().top) {
          <div class="ocr-image-container">
            <span>Top</span>
            <img [src]="ocrImages().top" alt="Top OCR Crop" />
          </div>
          } @if (ocrImages().bottom) {
          <div class="ocr-image-container">
            <span>Bottom</span>
            <img [src]="ocrImages().bottom" alt="Bottom OCR Crop" />
          </div>
          }
        </div>
      </div>
      }

      <div class="logs-container">
        <h3>Activity Log</h3>
        <div class="logs">
          @for (log of logs(); track $index) {
          <div class="log-entry">{{ log }}</div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .card-details {
        padding: 1rem;
        background: #f5f5f5;
        border-radius: 8px;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .libraries-info {
        margin-bottom: 0.5rem;
        color: #666;
        font-size: 0.8rem;
      }
      .hint {
        font-size: 0.8rem;
        color: #888;
        margin-top: 1rem;
      }
      .status-bar {
        background: #e0e0e0;
        padding: 0.5rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        font-family: monospace;
        font-size: 0.9rem;
      }
      .card-preview {
        margin-bottom: 1rem;
        text-align: center;
      }
      .card-preview img {
        max-width: 100%;
        max-height: 200px;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      .ocr-preview {
        margin-top: 1rem;
        border-top: 1px solid #ddd;
        padding-top: 0.5rem;
      }
      .ocr-preview h3 {
        font-size: 0.9rem;
        margin: 0 0 0.5rem 0;
        color: #666;
      }
      .ocr-images {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .ocr-image-container {
        flex: 1;
        min-width: 100px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #fff;
        padding: 0.25rem;
        border: 1px solid #eee;
        border-radius: 4px;
      }
      .ocr-image-container span {
        font-size: 0.7rem;
        color: #888;
        margin-bottom: 0.25rem;
      }
      .ocr-image-container img {
        max-width: 100%;
        height: auto;
        border: 1px solid #ccc;
      }
      .logs-container {
        margin-top: auto;
        border-top: 1px solid #ddd;
        padding-top: 1rem;
      }
      .logs {
        height: 200px;
        overflow-y: auto;
        background: #fff;
        border: 1px solid #ddd;
        padding: 0.5rem;
        font-family: monospace;
        font-size: 0.8rem;
      }
      .log-entry {
        margin-bottom: 2px;
        border-bottom: 1px solid #eee;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5rem;
      }
      .label {
        font-weight: bold;
        color: #666;
      }
      .value {
        font-weight: 500;
      }
    `,
  ],
})
export class CardDetailsComponent {
  info = input<CardInfo | null>(null);
  status = input<string>('');
  logs = input<string[]>([]);
  ocrImages = input<{ top: string | null; bottom: string | null }>({ top: null, bottom: null });
}
