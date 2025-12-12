# Architecture Documentation

## Project Overview

TCG ScanMan is a modern Angular application using standalone components, signals-based state management, and cutting-edge web APIs for computer vision and OCR.

## Technology Stack

### Core Framework

- **Angular 21**: Latest version with standalone components
- **TypeScript 5.9**: Strict type checking enabled
- **RxJS 7.8**: Reactive programming (minimal usage, prefer signals)

### Computer Vision

- **OpenCV.js 4.12**: WebAssembly-compiled OpenCV for browser
  - ArUco marker detection
  - Image processing
  - Perspective transformation

### OCR

- **Tesseract.js 6.0**: Pure JavaScript OCR engine
  - Web Worker-based processing
  - Language data loaded on-demand
  - English language support

### Build & Dev Tools

- **Angular CLI 21**: Project scaffolding and build
- **Vitest 4**: Unit testing
- **TypeScript Compiler**: Type checking and transpilation

## Application Structure

```
src/
├── app/
│   ├── components/          # Standalone UI components
│   │   ├── camera-preview.component.ts
│   │   └── scan-status.component.ts
│   ├── pages/               # Route components
│   │   └── scanner.page.ts
│   ├── services/            # Business logic services
│   │   ├── camera.service.ts
│   │   ├── aruco.service.ts
│   │   └── ocr.service.ts
│   ├── app.ts               # Root component
│   ├── app.config.ts        # Application configuration
│   └── app.routes.ts        # Route definitions
├── types/                   # Shared TypeScript types
│   └── card.model.ts
├── index.html              # HTML entry point
├── main.ts                 # Application bootstrap
└── styles.scss             # Global styles
```

## Service Architecture

### CameraService

**Responsibility**: Camera access and device management

**State (Signals)**:

- `stream`: Current MediaStream
- `devices`: Available video input devices
- `selectedDeviceId`: Currently selected camera
- `permissionGranted`: Camera permission status
- `error`: Error messages

**Key Methods**:

- `requestPermissions()`: Request camera access
- `selectCamera(deviceId)`: Switch to specific camera
- `selectNextCamera()`: Cycle through cameras
- `stopStream()`: Cleanup resources

**Storage**:

- Persists selected camera ID to localStorage
- Key: `tcg-scanman-camera-id`

### ArucoService

**Responsibility**: Marker detection and card position calculation

**Dependencies**:

- OpenCV.js (loaded globally from CDN)
- ArUco dictionary: DICT_6X6_250

**Key Methods**:

- `detectMarkers(video)`: Find ArUco markers in frame
- `calculateCardPosition(markers)`: Compute card location
- `extractCardRegion(video, position, region)`: Extract image for OCR

**Algorithm**:

1. Convert video frame to OpenCV Mat
2. Detect ArUco markers using `cv.detectMarkers()`
3. Calculate card center from marker positions
4. Estimate card corners based on marker arrangement
5. Compute rotation, scale, and confidence

### OcrService

**Responsibility**: Text recognition and parsing

**Dependencies**:

- Tesseract.js Worker
- English language data

**Key Methods**:

- `recognizeText(imageData)`: Extract text from image
- `parseTopSection(text)`: Parse Pokemon stage, name, HP, type
- `parseBottomSection(text)`: Parse card number, set, rarity

**OCR Pipeline**:

1. Initialize Tesseract worker with English language
2. Set character whitelist for better accuracy
3. Convert ImageData to canvas for recognition
4. Parse text using regex patterns
5. Return structured Pokemon card data

## Component Architecture

### CameraPreviewComponent

**Responsibility**: Video preview and real-time scanning

**Inputs**: None (root scanner component)
**Outputs**: Exposed signals for parent components

**State Management**:

- `markers`: Detected ArUco markers
- `cardPosition`: Calculated card position
- `recognizedData`: Parsed Pokemon card data

**Lifecycle**:

1. Effect watches camera stream
2. When stream available, attach to video element
3. Start scanning loop (10 FPS for markers)
4. When card detected with confidence > 70%, trigger OCR
5. OCR throttled to every 2 seconds
6. Update signals with results
7. Cleanup on destroy

**Rendering**:

- Video element with stream
- SVG overlay with card outline (when detected)
- Camera change button
- Permission prompt (when needed)

### ScanStatusComponent

**Responsibility**: Display detection status and card info

**Inputs**:

- `markersDetected`: Number of markers found
- `cardPosition`: Card position (for confidence)
- `recognizedData`: Recognized card information

**Rendering**:

- Detection metrics (markers, position, confidence)
- Confidence bar (color-coded: green/yellow/red)
- Card information table
- Type and rarity badges with colors

### ScannerPage

**Responsibility**: Layout and component integration

**Pattern**: Container component

- Imports and composes CameraPreview and ScanStatus
- Passes signals between components
- Responsive grid layout

## State Management Pattern

### Signal-Based Architecture

We use Angular signals for reactive state:

```typescript
// Writable signal
const markers = signal<MarkerDetection[]>([]);

// Update signal
markers.set([...newMarkers]);

// Read signal (in template or code)
const currentMarkers = markers();

// Computed signal
const markerCount = computed(() => markers().length);

// Effect for side effects
effect(() => {
  const stream = cameraService.stream();
  if (stream) {
    // React to stream changes
  }
});
```

**Benefits**:

- Fine-grained reactivity
- Automatic dependency tracking
- Better performance than RxJS for local state
- Type-safe throughout
- OnPush change detection compatible

## Type System

### Core Types

```typescript
// Card data model
interface PokemonCard {
  stage: PokemonStage;
  name: string;
  hitPoints: number | null;
  type: PokemonType;
  cardNumber: string;
  totalCards: string;
  rarity: CardRarity;
  confidence: number;
}

// Marker detection result
interface MarkerDetection {
  id: number;
  corners: number[][];
}

// Card position in frame
interface CardPosition {
  corners: number[][];
  center: { x: number; y: number };
  rotation: number;
  scale: number;
  confidence: number;
}
```

All types are strictly typed with no `any` usage.

## Performance Considerations

### Scanning Loop Optimization

- **Marker Detection**: 10 FPS (100ms interval)
- **OCR Processing**: Max every 2 seconds
- **OCR Throttling**: Prevents overwhelming system
- **Web Workers**: Tesseract runs in background thread

### Memory Management

- Video streams properly stopped on cleanup
- Canvas elements created temporarily, not cached
- OpenCV Mat objects explicitly deleted
- Tesseract worker terminated on service destroy

### Change Detection

- All components use `OnPush` strategy
- Signals trigger minimal re-renders
- Template expressions use pure functions
- No function calls in templates

## Browser Compatibility

### Required APIs

- **MediaDevices API**: Camera access
- **WebRTC**: Video streaming
- **Canvas API**: Image processing
- **Web Workers**: OCR processing
- **WebAssembly**: OpenCV.js
- **LocalStorage**: Camera preference

### Polyfills

None required for modern browsers (2022+).

### Mobile Considerations

- Responsive design for mobile screens
- `facingMode: 'environment'` for back camera
- Touch-friendly controls
- Reduced OCR frequency on low-power devices

## Security & Privacy

### Data Handling

- **No Network Requests**: All processing local
- **No Analytics**: No tracking code
- **No Storage**: Card data ephemeral
- **Camera Access**: Only with explicit permission

### Content Security Policy

Future CSP headers should allow:

- `'self'` for scripts
- `docs.opencv.org` for OpenCV.js CDN
- `blob:` for Web Workers
- `data:` for base64 images

## Future Enhancements

### Planned Features

1. **IndexedDB Storage**: Save scanned cards
2. **Export Functions**: JSON/CSV export
3. **Collection View**: Browse saved cards
4. **Duplicate Detection**: Flag duplicate cards
5. **Statistics**: Collection analytics

### Optional Cloud Features

6. **Gemini API**: Improved recognition accuracy
7. **Price Integration**: TCGPlayer/CardMarket API
8. **User Accounts**: Cloud backup (optional)
9. **Sharing**: Share collection links

### Technical Improvements

10. **PWA**: Offline support, install prompt
11. **Service Worker**: Cache OpenCV.js
12. **Better OCR**: Custom trained model
13. **Batch Scanning**: Multiple cards
14. **Manual Correction**: Edit OCR results

## Development Workflow

### Code Style

- Prettier formatting enforced
- Angular style guide followed
- Strict TypeScript checking
- No console errors in production

### Testing Strategy

- **Unit Tests**: Services and pure functions
- **Component Tests**: Component logic
- **E2E Tests**: Full scanning workflow
- **Visual Tests**: UI regression testing

### Build Optimization

- **Production Build**: AOT compilation
- **Tree Shaking**: Unused code removal
- **Lazy Loading**: Route-based code splitting
- **Asset Optimization**: Image and style optimization

## Debugging Tips

### OpenCV Issues

- Check browser console for OpenCV load errors
- Verify `cv` object is available globally
- Use `cv.getBuildInformation()` to check version

### Camera Issues

- Check browser permissions
- Verify HTTPS (required for getUserMedia)
- Test with different browsers
- Check device list with `navigator.mediaDevices.enumerateDevices()`

### OCR Issues

- Check Tesseract worker initialization
- Verify language data download
- Test with high-contrast text
- Adjust character whitelist for specific needs

### Marker Detection

- Verify correct ArUco dictionary
- Check marker print quality
- Test lighting conditions
- Adjust detection parameters if needed

---

**This architecture prioritizes offline operation, user privacy, and modern Angular best practices.**
