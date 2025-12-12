# TCG ScanMan - User Guide

## Getting Started

### 1. First Time Setup

When you first open the application, you'll see a prompt to grant camera access:

1. Click **"Grant Camera Access"** button
2. Your browser will ask for camera permission - click **Allow**
3. The camera preview will start automatically

### 2. Camera Selection

If you have multiple cameras (e.g., front and back on mobile, or multiple USB cameras):

- Click the **"Change Camera"** button to cycle through available cameras
- Your camera preference is automatically saved for next time
- The button shows which camera you're using (e.g., "1/2" means camera 1 of 2)

### 3. Scanning Pokemon Cards

#### Required Setup

You'll need a 3D printed holder with ArUco markers. The holder should:

- Hold a standard Pokemon card (63mm × 88mm)
- Have ArUco markers positioned around the card
- Use markers from the DICT_6X6_250 dictionary

#### Scanning Process

1. **Position the card**: Place your Pokemon card in the 3D printed holder
2. **Hold steady**: Position the holder in view of the camera
3. **Wait for detection**:

   - Watch the "Markers Detected" count increase as markers are found
   - When 2+ markers are detected, the app calculates card position
   - A green outline will appear around the detected card
   - The confidence meter shows detection quality (aim for 70%+)

4. **OCR Recognition**: Once the card is detected with good confidence:
   - The app automatically reads the card
   - Information appears in the right panel as it's recognized
   - Top section: Pokemon name, stage, HP, type
   - Bottom section: Card number, set info, rarity

## Understanding the Status Panel

### Detection Section

- **Markers Detected**: How many ArUco markers are visible (need 2+ for card position)
- **Card Position**: Shows "Detected" when the card location is calculated
- **Confidence**: Percentage showing detection reliability
  - 🟢 Green (70-100%): Excellent - OCR will run
  - 🟡 Yellow (40-69%): Fair - adjust positioning
  - 🔴 Red (0-39%): Poor - reposition card/holder

### Card Information Section

Shows recognized data as it's extracted:

- **Name**: Pokemon name (e.g., "Charizard")
- **Stage**: Basic, Stage 1, Stage 2, VMAX, V, GX, EX
- **HP**: Hit points (e.g., "120")
- **Type**: Pokemon type with color-coded badge
  - 🟢 Grass, 🔴 Fire, 🔵 Water, ⚡ Lightning
  - 🩷 Psychic, 🟤 Fighting, ⚫ Darkness, ⚪ Metal
  - 🩷 Fairy, 🟣 Dragon, ⚪ Colorless
- **Card Number**: Position in set (e.g., "4/102")
- **Rarity**: Common, Uncommon, Rare, Rare Holo, Ultra Rare, Secret Rare

## Tips for Best Results

### Lighting

- ✅ Use bright, even lighting
- ✅ Avoid harsh shadows on the card
- ❌ Don't point light sources directly at camera
- ❌ Avoid glare on glossy/holo cards

### Positioning

- ✅ Keep card flat and perpendicular to camera
- ✅ Fill most of the camera view with the holder
- ✅ Hold steady for 2-3 seconds
- ❌ Don't angle the card too much
- ❌ Don't move while scanning

### Camera Distance

- **Too close**: Markers may be cut off
- **Too far**: Text may be too small for OCR
- **Just right**: All markers visible, card fills ~60% of frame

### Troubleshooting

**Problem: No markers detected**

- Check that markers are visible in camera view
- Ensure markers are printed clearly (not blurry)
- Verify you're using DICT_6X6_250 markers
- Try adjusting distance or angle

**Problem: Markers detected but low confidence**

- Add more markers to your holder (4 is better than 2)
- Improve lighting conditions
- Reduce motion/camera shake
- Check that markers aren't obscured

**Problem: Card detected but no OCR results**

- Wait 2-3 seconds (OCR is throttled to save resources)
- Improve lighting on card text
- Move slightly closer to camera
- Ensure text isn't obscured or shadowed

**Problem: Wrong card information**

- OCR isn't perfect - especially with stylized fonts
- Try different angles or lighting
- Clean cards scan better than worn ones
- Future versions may add manual correction

## Privacy & Offline Usage

- ✅ **Fully Offline**: Works without internet (after initial page load)
- ✅ **No Data Collection**: Nothing is sent to any server
- ✅ **No Storage**: Card data is displayed but not saved
- ✅ **Camera Preference Only**: Only your camera choice is stored locally

## Browser Compatibility

### Recommended Browsers

- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)

### Requirements

- Modern browser with WebRTC support
- JavaScript enabled
- Camera/webcam access
- Minimum 2GB RAM recommended

## Future Features

The application is designed to be extended with:

- [ ] Save scanned cards to local database
- [ ] Export collection to CSV/JSON
- [ ] Duplicate detection
- [ ] Collection statistics
- [ ] Integration with pricing APIs
- [ ] Cloud backup (optional)
- [ ] AI-enhanced recognition (Gemini API)

## Keyboard Shortcuts

- `Space`: Change camera (when multiple available)
- `R`: Refresh/reset detection

## Need Help?

If you encounter issues:

1. Check your browser console for errors
2. Verify camera permissions in browser settings
3. Try a different browser
4. Ensure your ArUco markers are correct
5. Open an issue on GitHub with details

---

**Enjoy scanning your Pokemon card collection! 🎴✨**
