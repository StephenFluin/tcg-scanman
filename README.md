# TCG ScanMan - Pokemon Card Scanner

An offline, open-source Angular application for scanning and cataloging Pokemon trading cards using computer vision and OCR technology.

## Features

- 📷 **Webcam Integration**: Access device cameras with permission management and device selection
- 🎯 **ArUco Marker Detection**: Precise card positioning using OpenCV.js and ArUco markers
- 🔍 **OCR Recognition**: Extract card details (name, HP, type, card number, rarity) using Tesseract.js
- 💾 **Offline First**: Completely offline - no server required, no data sent anywhere
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Real-time Feedback**: Live preview with card outline overlay when detected

## How It Works

1. **Camera Setup**: Grant camera permissions and select your preferred camera (saved to localStorage)
2. **Card Positioning**: Place a Pokemon card in a 3D printed holder with ArUco markers
3. **Detection**: The app detects the markers and calculates the exact card position
4. **Recognition**: Once positioned correctly, OCR reads card details from top and bottom regions
5. **Display**: All recognized information is shown in real-time on the right panel

## Technology Stack

- **Framework**: Angular 21 with standalone components
- **Computer Vision**: OpenCV.js for ArUco marker detection
- **OCR**: Tesseract.js for offline text recognition
- **State Management**: Angular signals
- **Styling**: Component-scoped SCSS

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## ArUco Marker Setup

To use the card scanner with ArUco markers for precise card detection:

1. **Generate the marker PDF**:

   ```bash
   python create-pokemon-pdf.py
   ```

   This creates `pokemon_card_scanning_mat.pdf` with 4 ArUco markers (IDs 0, 1, 2, 3).

2. **Print the PDF** on white paper (Letter or A4 size)

3. **Place your Pokemon card** in the center dashed rectangle

4. **Position the paper** so all 4 markers are visible to your camera

5. **Enable debug mode** in the scanner to see marker detection in real-time

The scanner automatically detects the markers and uses them to:

- Create a perspective transform to flatten the view
- Detect the card boundaries using edge detection
- Extract the card with precise positioning

**Note**: The markers use the ARUCO_ORIGINAL dictionary (compatible with js-aruco2 library).

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
