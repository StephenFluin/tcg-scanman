/**
 * Pokemon card type (basic, stage 1, stage 2, etc.)
 */
export type PokemonStage = 'Basic' | 'Stage 1' | 'Stage 2' | 'VMAX' | 'V' | 'GX' | 'EX' | 'Unknown';

/**
 * Pokemon energy type
 */
export type PokemonType =
  | 'Grass'
  | 'Fire'
  | 'Water'
  | 'Lightning'
  | 'Psychic'
  | 'Fighting'
  | 'Darkness'
  | 'Metal'
  | 'Fairy'
  | 'Dragon'
  | 'Colorless'
  | 'Unknown';

/**
 * Card rarity
 */
export type CardRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Rare Holo'
  | 'Ultra Rare'
  | 'Secret Rare'
  | 'Unknown';

/**
 * Pokemon card information extracted from scanning
 */
export interface PokemonCard {
  stage: PokemonStage;
  name: string;
  hitPoints: number | null;
  type: PokemonType;
  cardNumber: string;
  totalCards: string;
  rarity: CardRarity;
  confidence: number; // 0-1 confidence score for OCR accuracy
}

/**
 * ArUco marker detection result
 */
export interface MarkerDetection {
  id: number;
  corners: number[][]; // [[x, y], [x, y], [x, y], [x, y]]
}

/**
 * Card position calculated from ArUco markers
 */
export interface CardPosition {
  corners: number[][]; // [[x, y], [x, y], [x, y], [x, y]]
  center: { x: number; y: number };
  rotation: number; // in degrees
  scale: number;
  confidence: number; // 0-1 confidence in detection
}

/**
 * Marker detection log entry
 */
export interface MarkerDetectionLog {
  timestamp: number;
  markerId: number;
  location: { x: number; y: number }; // Center of marker
}

/**
 * Scanning status
 */
export interface ScanStatus {
  markersDetected: number;
  cardDetected: boolean;
  cardPosition: CardPosition | null;
  recognizedData: Partial<PokemonCard>;
  isProcessing: boolean;
}
