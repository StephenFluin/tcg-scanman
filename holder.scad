// --- Pokemon Card Scanning Stage with ArUco Mounts ---
// Units: mm

// --- Parameters ---
// Standard sleeve is ~66x91mm. We add wiggle room.
card_width = 67.0; 
card_height = 94.0;
card_depth = 1.5; // Depth of the card slot
floor_thickness = 2.0; // Thickness of the plastic under the card

// ArUco Marker Settings
marker_size = 20.0; // Size of your paper markers (matches the PDF)
marker_pocket_depth = 0.6; // How deep the paper sits (flush with top)
border_padding = 5.0; // Plastic between card and markers

// Finger hole to push card out
finger_hole_dia = 25.0; 

// --- Derived Calculations ---
total_depth = floor_thickness + card_depth;
// The frame needs to be wide enough to hold the card + borders + markers
frame_width = card_width + (2 * border_padding) + (2 * marker_size);
frame_height = card_height + (2 * border_padding) + (2 * marker_size);

$fn = 60; // Smooth circles

module main_body() {
    difference() {
        // 1. Base Block
        translate([-frame_width/2, -frame_height/2, 0])
        cube([frame_width, frame_height, total_depth]);
        
        // 2. Card Slot (Center)
        translate([-card_width/2, -card_height/2, floor_thickness])
        cube([card_width, card_height, card_depth + 1]); // +1 to ensure cut through top
        
        // 3. Finger Hole (Center)
        translate([0, 0, -1])
        cylinder(h = total_depth + 2, d = finger_hole_dia);
        
        // 4. Marker Pockets (Corners)
        // We calculate positions relative to the frame edges
        
        // Top Left
        translate([
            -frame_width/2 + (marker_size/2) + 2, 
            frame_height/2 - (marker_size/2) - 2, 
            total_depth - marker_pocket_depth
        ])
        marker_cutout();
        
        // Top Right
        translate([
            frame_width/2 - (marker_size/2) - 2, 
            frame_height/2 - (marker_size/2) - 2, 
            total_depth - marker_pocket_depth
        ])
        marker_cutout();
        
        // Bottom Left
        translate([
            -frame_width/2 + (marker_size/2) + 2, 
            -frame_height/2 + (marker_size/2) + 2, 
            total_depth - marker_pocket_depth
        ])
        marker_cutout();
        
        // Bottom Right
        translate([
            frame_width/2 - (marker_size/2) - 2, 
            -frame_height/2 + (marker_size/2) + 2, 
            total_depth - marker_pocket_depth
        ])
        marker_cutout();
    }
}

module marker_cutout() {
    // A square recess for the paper marker
    union() {
        // The square pocket
        cube([marker_size, marker_size, marker_pocket_depth+1], center=true);
        // A tiny finger notch to help remove the sticker if needed (optional)
        translate([marker_size/2, 0, 0])
        cube([5, 5, marker_pocket_depth+1], center=true);
    }
}

// --- Render ---
main_body();