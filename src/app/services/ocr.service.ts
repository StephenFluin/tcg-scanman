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
   * Pokemon cards use fonts similar to Gill Sans, Futura, or Helvetica
   */
  private async initialize(): Promise<void> {
    try {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        // Optimize for Pokemon card fonts (sans-serif, bold)
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/HP '♂♀",
        preserve_interword_spaces: '1',
      });
      this.isInitialized = true;
      console.log(
        '✅ OCR initialized with Pokemon card font optimization (Gill Sans/Helvetica style)'
      );
    } catch (err) {
      console.error('Failed to initialize OCR:', err);
    }
  }

  /**
   * Recognize text from an image
   * Applies preprocessing to improve OCR accuracy for Pokemon card fonts
   */
  async recognizeText(imageData: ImageData, isCardNumber: boolean = false): Promise<string> {
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

      // Preprocess image for better OCR
      this.preprocessForOCR(ctx, canvas.width, canvas.height);

      // Configure OCR parameters based on content type
      if (isCardNumber) {
        // Optimize for card numbers (##/### or ###/### format)
        await this.worker.setParameters({
          tessedit_char_whitelist: '0123456789/',
          preserve_interword_spaces: '0',
        });
      } else {
        // Reset to normal text recognition
        await this.worker.setParameters({
          tessedit_char_whitelist:
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/HP '♂♀",
          preserve_interword_spaces: '1',
        });
      }

      const result = await this.worker.recognize(canvas);
      let text = result.data.text.trim();

      // Post-process card numbers to ensure correct format
      if (isCardNumber) {
        text = this.cleanCardNumber(text);
      }

      return text;
    } catch (err) {
      console.error('OCR recognition error:', err);
      return '';
    }
  }

  /**
   * Clean and validate card number format
   * Expected formats: ##/##, ##/###, ###/###
   */
  private cleanCardNumber(text: string): string {
    // Remove any whitespace
    text = text.replace(/\s+/g, '');

    // Look for pattern: digits/digits
    const match = text.match(/(\d{1,3})\/(\d{1,3})/);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }

    return text;
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
   * Preprocess image to improve OCR accuracy for Pokemon card fonts
   * Enhances contrast and sharpness for better text recognition
   */
  private preprocessForOCR(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Apply contrast enhancement and slight sharpening
    for (let i = 0; i < data.length; i += 4) {
      // Increase contrast (works well for bold sans-serif text)
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const contrast = 1.3; // Increase contrast by 30%

      for (let j = 0; j < 3; j++) {
        let value = (data[i + j] - 128) * contrast + 128;
        data[i + j] = Math.max(0, Math.min(255, value));
      }
    }

    ctx.putImageData(imageData, 0, 0);
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
