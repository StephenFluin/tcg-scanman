import { Injectable } from '@angular/core';
import { createWorker, type Worker } from 'tesseract.js';
import type { PokemonCard, PokemonStage, PokemonType, CardRarity } from '../../types/card.model';

/**
 * Service to perform OCR on Pokemon cards using Tesseract.js
 */
@Injectable({
  providedIn: 'root',
})
export class OcrService {
  private worker: Worker | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Tesseract worker
   */
  private async initialize(): Promise<void> {
    try {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/HP ',
      });
      this.isInitialized = true;
      console.log('OCR initialized');
    } catch (err) {
      console.error('Failed to initialize OCR:', err);
    }
  }

  /**
   * Recognize text from an image
   */
  async recognizeText(imageData: ImageData): Promise<string> {
    if (!this.isInitialized || !this.worker) {
      console.warn('OCR not initialized');
      return '';
    }

    try {
      // Convert ImageData to canvas for Tesseract
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return '';
      }
      ctx.putImageData(imageData, 0, 0);

      const result = await this.worker.recognize(canvas);
      return result.data.text.trim();
    } catch (err) {
      console.error('OCR recognition error:', err);
      return '';
    }
  }

  /**
   * Parse top section of card (stage, name, HP, type)
   */
  parseTopSection(text: string): Partial<PokemonCard> {
    const result: Partial<PokemonCard> = {
      stage: 'Unknown',
      name: '',
      hitPoints: null,
      type: 'Unknown',
      confidence: 0.5,
    };

    // Parse stage (Basic, Stage 1, Stage 2, etc.)
    const stageMatch = text.match(/\b(Basic|Stage\s*[12]|VMAX|V|GX|EX)\b/i);
    if (stageMatch) {
      result.stage = this.normalizeStage(stageMatch[1]);
    }

    // Parse HP (hit points)
    const hpMatch = text.match(/HP\s*(\d+)/i);
    if (hpMatch) {
      result.hitPoints = parseInt(hpMatch[1], 10);
    }

    // Extract name (typically the largest text that isn't stage or HP)
    // This is a simplified approach - may need refinement
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      if (
        line.length > 3 &&
        !line.includes('HP') &&
        !line.match(/\b(Basic|Stage)\b/i) &&
        !result.name
      ) {
        result.name = line;
        break;
      }
    }

    // Type would require image recognition of the type symbol
    // For now, we'll leave it as Unknown
    result.type = this.inferTypeFromText(text);

    return result;
  }

  /**
   * Parse bottom section of card (card number, total, rarity)
   */
  parseBottomSection(text: string): Partial<PokemonCard> {
    const result: Partial<PokemonCard> = {
      cardNumber: '',
      totalCards: '',
      rarity: 'Unknown',
      confidence: 0.5,
    };

    // Parse card number format: "123/456" or "123/456 ●" (with rarity symbol)
    const cardNumMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (cardNumMatch) {
      result.cardNumber = cardNumMatch[1];
      result.totalCards = cardNumMatch[2];
    }

    // Rarity is typically indicated by symbols (●, ◆, ★)
    // but OCR may not recognize these well
    // Check for text indicators
    if (text.includes('●') || text.toLowerCase().includes('common')) {
      result.rarity = 'Common';
    } else if (text.includes('◆') || text.toLowerCase().includes('uncommon')) {
      result.rarity = 'Uncommon';
    } else if (text.includes('★') || text.toLowerCase().includes('rare')) {
      result.rarity = 'Rare';
    }

    // Secret rare often has card number > total
    if (result.cardNumber && result.totalCards) {
      const cardNum = parseInt(result.cardNumber, 10);
      const totalNum = parseInt(result.totalCards, 10);
      if (cardNum > totalNum) {
        result.rarity = 'Secret Rare';
      }
    }

    return result;
  }

  /**
   * Normalize stage text to standard format
   */
  private normalizeStage(stage: string): PokemonStage {
    const normalized = stage.trim().toLowerCase().replace(/\s+/g, ' ');

    if (normalized === 'basic') return 'Basic';
    if (normalized.includes('stage 1') || normalized.includes('stage1')) return 'Stage 1';
    if (normalized.includes('stage 2') || normalized.includes('stage2')) return 'Stage 2';
    if (normalized === 'vmax') return 'VMAX';
    if (normalized === 'v') return 'V';
    if (normalized === 'gx') return 'GX';
    if (normalized === 'ex') return 'EX';

    return 'Unknown';
  }

  /**
   * Attempt to infer Pokemon type from text
   */
  private inferTypeFromText(text: string): PokemonType {
    const lowerText = text.toLowerCase();

    // Look for type keywords in text
    if (lowerText.includes('grass')) return 'Grass';
    if (lowerText.includes('fire')) return 'Fire';
    if (lowerText.includes('water')) return 'Water';
    if (lowerText.includes('lightning') || lowerText.includes('electric')) return 'Lightning';
    if (lowerText.includes('psychic')) return 'Psychic';
    if (lowerText.includes('fighting')) return 'Fighting';
    if (lowerText.includes('darkness') || lowerText.includes('dark')) return 'Darkness';
    if (lowerText.includes('metal') || lowerText.includes('steel')) return 'Metal';
    if (lowerText.includes('fairy')) return 'Fairy';
    if (lowerText.includes('dragon')) return 'Dragon';
    if (lowerText.includes('colorless')) return 'Colorless';

    return 'Unknown';
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}
