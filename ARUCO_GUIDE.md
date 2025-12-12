# ArUco Marker Setup Guide

## What are ArUco Markers?

ArUco markers are square fiducial markers that can be detected by computer vision algorithms. They look like QR codes but are specifically designed for camera pose estimation and object tracking.

## Required Dictionary

This application uses the **ARUCO_MIP_36h12** dictionary, which contains:

- AprilTag-style markers optimized for detection
- 250 unique marker IDs (0-249)
- Better detection at various angles and lighting conditions
- Part of the MIP (Manually Improved Performance) family
- More robust than standard ArUco for challenging conditions

## Generating Markers

### Using the Python Script (Recommended)

The repository includes a Python script that generates a complete PDF scanning mat:

```bash
python create-pokemon-pdf.py
```

This creates `pokemon_card_scanning_mat.pdf` with:

- Card placement guide (63.5mm × 88.9mm)
- 4 ARUCO_MIP_36h12 markers at corners (IDs 0-3)
- Proper spacing and labels

### Online Generator

Note: Most online generators don't support ARUCO_MIP_36h12. Use the Python script instead.

### Using OpenCV (Python)

```python
import cv2
import cv2.aruco as aruco

# Create ArUco dictionary (ARUCO_MIP_36h12)
aruco_dict = aruco.getPredefinedDictionary(aruco.DICT_ARUCO_MIP_36h12)

# Generate markers
for marker_id in range(4):  # Generate markers 0-3
    marker_image = aruco.generateImageMarker(aruco_dict, marker_id, 200)
    cv2.imwrite(f'aruco_marker_{marker_id}.png', marker_image)
    print(f'Generated marker {marker_id}')
```

## Printing Markers

### Print Settings

- **Size**: 30-50mm per marker
- **Quality**: High quality, 600+ DPI
- **Paper**: White, matte finish (avoid glossy)
- **Contrast**: Ensure solid black and pure white
- **Border**: Leave white border around marker

### Tips

- ✅ Use high-quality printer
- ✅ Measure printed size to verify
- ✅ Laminate for durability
- ✅ Mount on rigid backing (cardstock)
- ❌ Don't resize after printing
- ❌ Avoid smudges or marks
- ❌ Don't use worn/damaged markers

## 3D Printed Holder Design

### Marker Placement

For a Pokemon card holder (63mm × 88mm):

```
   [Marker 0]              [Marker 1]
        ┌──────────────────────┐
        │                      │
        │    Pokemon Card      │
        │     63 × 88mm        │
        │                      │
        └──────────────────────┘
   [Marker 3]              [Marker 2]
```

### Recommended Spacing

- **Card to Marker**: 10-15mm clearance
- **Marker Size**: 40mm × 40mm
- **Total Holder**: ~95mm × 120mm

### 3D Printing Guidelines

**Material**: PLA or PETG
**Layer Height**: 0.2mm
**Infill**: 20%
**Color**: Light colors (white, gray) - avoid black

**Design Requirements**:

1. Flat surface for markers
2. Recessed pocket for card (1-2mm deep)
3. Markers must be coplanar (flat)
4. Good contrast between marker and holder

## Marker Detection Tips

### Optimal Conditions

- **Distance**: 30-60cm from camera
- **Angle**: Perpendicular (straight on)
- **Lighting**: Bright, even, indirect
- **Background**: Uncluttered, contrasting

### Common Issues

**"0 markers detected"**

- Markers not in camera view
- Poor print quality
- Wrong dictionary used
- Insufficient lighting
- Markers too small/far

**"1 marker detected" (need 2+)**

- Some markers out of frame
- Some markers obscured
- Inconsistent lighting
- Markers damaged/worn

**"Low confidence"**

- Markers detected but perspective is poor
- Too much angle/tilt
- Markers not coplanar
- Need more markers

## Testing Your Markers

Before using with the app, test your markers:

1. **Visual Check**:

   - Sharp black/white contrast
   - No smudges or damage
   - Correct size
   - White border present

2. **Camera Test**:

   - Open the TCG ScanMan app
   - Position markers in view
   - Check "Markers Detected" count
   - Aim for all markers detected consistently

3. **Position Test**:
   - Move markers around
   - Verify detection at different angles
   - Test at various distances
   - Check confidence score

## Alternative Marker Counts

### 2-Marker Setup (Minimum)

- Simplest design
- Lower confidence
- More sensitive to positioning
- Good for testing

### 4-Marker Setup (Recommended)

- Balanced design
- Good confidence
- Reliable detection
- Standard for most use cases

### 6-Marker Setup (Maximum)

- Best confidence
- Most reliable
- Redundancy if some obscured
- Larger holder required

## ArUco Dictionary Reference

### ARUCO_MIP_36h12 (Used by this app)

- **DICT_ARUCO_MIP_36h12**: AprilTag-style, 250 markers (IDs 0-249)
- Optimized for better detection at various angles
- Superior performance in challenging lighting
- Part of MIP (Manually Improved Performance) family
- **This is what the app is configured to use**

### Other Dictionaries (for reference)

```javascript
cv.DICT_4X4_50; // 4×4 grid, 50 markers
cv.DICT_4X4_100; // 4×4 grid, 100 markers
cv.DICT_4X4_250; // 4×4 grid, 250 markers
cv.DICT_5X5_50; // 5×5 grid, 50 markers
cv.DICT_5X5_100; // 5×5 grid, 100 markers
cv.DICT_5X5_250; // 5×5 grid, 250 markers
cv.DICT_6X6_50; // 6×6 grid, 50 markers
cv.DICT_6X6_100; // 6×6 grid, 100 markers
cv.DICT_6X6_250; // 6×6 grid, 250 markers
cv.DICT_7X7_50; // 7×7 grid, 50 markers
cv.DICT_7X7_100; // 7×7 grid, 100 markers
cv.DICT_7X7_250; // 7×7 grid, 250 markers
cv.DICT_ARUCO_ORIGINAL; // Original ArUco (5×5, 1024 markers) ← We use this
```

## Resources

- **ArUco Documentation**: https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html
- **Online Generator**: https://chev.me/arucogen/
- **OpenCV.js**: https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html

---

**Ready to create your marker setup? Start with 4 markers (IDs 0-3) and test detection before building your full holder!**
