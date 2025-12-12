# Marker Detection Troubleshooting

## Changes Made

I've switched from OpenCV.js to **js-aruco2** library which is more reliable for ArUco marker detection in the browser.

### Key Updates:

1. **Removed OpenCV.js CDN dependency** - was causing issues
2. **Implemented js-aruco2** - pure JavaScript ArUco detector
3. **Added visual debugging** - markers now show with red outlines and ID numbers
4. **Better error logging** - check browser console for detection info

## What You Should See Now

### Visual Feedback:

- **Red outlines** around detected markers
- **Red numbers** showing marker IDs (0, 1, 2, 3, etc.)
- **Green outline** around card when position is calculated

### In Browser Console:

- "✅ ArUco detector initialized successfully"
- "✅ Detected X markers" when markers are found
- Marker ID and corner positions for each detected marker

## Troubleshooting Steps

### 1. Check Browser Console

Open Developer Tools (F12) and look for:

- Initialization message
- Detection logs
- Any error messages

### 2. Verify Marker Requirements

The **js-aruco2** library detects standard ArUco markers. Your markers should:

- Be high contrast (pure black on pure white)
- Have a white border around them
- Be relatively flat (not curved or bent)
- Be well-lit without glare
- Fill a reasonable portion of the frame

### 3. Marker Size in Frame

- Too small: Markers won't be detected
- Too large: Markers may be cut off
- **Ideal**: Each marker should be ~50-100 pixels in the camera view

### 4. Lighting Conditions

- ✅ Bright, even lighting
- ✅ Avoid shadows across markers
- ❌ No harsh glare on markers
- ❌ Don't backlight the holder

### 5. Camera Focus

- Ensure markers are in focus
- If blurry, move closer/farther from camera
- Some cameras have fixed focus distance

### 6. Marker Standards

js-aruco2 detects standard ArUco markers. Make sure your markers are:

- Generated from the standard ArUco dictionary
- NOT QR codes or other fiducial markers
- Printed at high resolution (300+ DPI)
- Not pixelated or blurry when printed

## Testing Checklist

- [ ] Open http://localhost:4200/
- [ ] Grant camera permissions
- [ ] Point camera at your printed holder
- [ ] Check browser console for "ArUco detector initialized"
- [ ] Look for red outlines on detected markers
- [ ] See marker ID numbers displayed
- [ ] Verify all 4 markers are detected
- [ ] Green card outline appears when 2+ markers detected

## Expected Behavior

### When Working Correctly:

1. Camera preview shows
2. Red polygons outline each detected marker
3. Numbers (0, 1, 2, 3) appear on each marker
4. Status panel shows "Markers Detected: 4"
5. Green polygon outlines the card area
6. Confidence meter shows good detection

### If Still Not Detecting:

#### Option A: Test with On-Screen Markers

1. Open this ArUco generator: https://chev.me/arucogen/
2. Generate marker ID 0
3. Display full-screen on another device/monitor
4. Point camera at screen
5. Should detect the marker

#### Option B: Check Marker Format

Your 3D printed holder appears to have markers that might be:

- Too small in the camera view
- Not standard ArUco format
- Custom markers not in standard dictionary

#### Option C: Print Test Markers

Generate and print a test marker:

```
1. Go to https://chev.me/arucogen/
2. Select "4x4" or "5x5" dictionary
3. Marker ID: 0
4. Marker size: 200px
5. Download and print at actual size
6. Test with printed marker
```

## Supported Marker Dictionaries

js-aruco2 supports these ArUco dictionaries:

- 4x4 (50, 100, 250, 1000 markers)
- 5x5 (50, 100, 250, 1000 markers)
- 6x6 (50, 100, 250, 1000 markers)
- Original ArUco markers

**The code currently expects standard ArUco markers from any of these dictionaries.**

## Next Steps If Still Not Working

1. **Take a clear photo** of your holder with good lighting
2. **Check the printed marker pattern** - are they actually ArUco markers?
3. **Try with a test marker** from the online generator
4. **Share console logs** - what errors/warnings appear?

## Alternative: Use Different Marker Library

If your markers are a custom format, we may need to:

1. Identify the exact marker format you're using
2. Switch to a different detection library
3. Or regenerate markers in standard ArUco format

---

**The app should now show real-time visual feedback of marker detection. If you see red outlines and numbers, it's working!**
