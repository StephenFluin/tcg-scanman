// --- Pokemon Card Scanning Stage (Multi-Color / Filament Swap) ---
// Dictionary: ARUCO_MIP_36h12 (6x6 Grid)
// Layout: Traffic Cone Style (Base Color -> Swap -> Marker Color)

// --- Parameters ---
card_width = 67.0; 
card_height = 94.0;
card_depth = 1.5; 
floor_thickness = 2.0; 

// Marker Settings
marker_size = 20.0; 
marker_grid_n = 6; // MIP_36h12 is a 6x6 grid
border_bits = 1;   // Standard ArUco has 1 bit of black border
marker_z_lift = 0.6; // Height of the raised black parts (3 layers @ 0.2mm)

// Padding
border_padding = 5.0; 
finger_hole_dia = 25.0; 

// --- Derived Calc ---
base_height = floor_thickness + card_depth;
total_height = base_height + marker_z_lift;
frame_width = card_width + (2 * border_padding) + (2 * marker_size);
frame_height = card_height + (2 * border_padding) + (2 * marker_size);
pixel_size = marker_size / (marker_grid_n + 2 * border_bits); 

$fn = 60;

module main() {
    // 1. The White Base
    color("white") 
    difference() {
        translate([-frame_width/2, -frame_height/2, 0])
        cube([frame_width, frame_height, base_height]);
        
        // Card Slot
        translate([-card_width/2, -card_height/2, floor_thickness])
        cube([card_width, card_height, card_depth + 1]); 
        
        // Finger Hole
        translate([0, 0, -1])
        cylinder(h = total_height + 2, d = finger_hole_dia);
    }
    
    // 2. The Black Markers (Raised)
    color("black")
    translate([0, 0, base_height]) {
        // Top Left: ID 0
        translate([-frame_width/2 + marker_size/2 + 2, frame_height/2 - marker_size/2 - 2, 0])
        draw_marker(0);

        // Top Right: ID 1
        translate([frame_width/2 - marker_size/2 - 2, frame_height/2 - marker_size/2 - 2, 0])
        draw_marker(1);
        
        // Bottom Left: ID 2
        translate([-frame_width/2 + marker_size/2 + 2, -frame_height/2 + marker_size/2 + 2, 0])
        draw_marker(2);
        
        // Bottom Right: ID 3
        translate([frame_width/2 - marker_size/2 - 2, -frame_height/2 + marker_size/2 + 2, 0])
        draw_marker(3);
    }
}

module draw_marker(id) {
    // Center the marker drawing
    translate([-marker_size/2, -marker_size/2, 0]) {
        
        // A. Draw Black Border (The "Quiet Zone" is handled by the white base underneath)
        difference() {
            cube([marker_size, marker_size, marker_z_lift]);
            
            // Cut out the inner area for the grid bits
            translate([pixel_size, pixel_size, -0.1])
            cube([marker_size - 2*pixel_size, marker_size - 2*pixel_size, marker_z_lift + 0.2]);
        }
        
        // B. Draw the Bits
        bits = get_marker_bits(id);
        
        for (r = [0 : marker_grid_n-1]) {
            for (c = [0 : marker_grid_n-1]) {
                // In OpenSCAD, row 0 is typically bottom, but ArUco matrices are top-left.
                // We map row r (0 at top) to Y position.
                // y = (marker_grid_n - 1 - r) * pixel_size + border_offset
                
                if (bits[r][c] == 1) {
                    translate([
                        (c + 1) * pixel_size, 
                        (marker_grid_n - 1 - r + 1) * pixel_size, 
                        0
                    ])
                    cube([pixel_size, pixel_size, marker_z_lift]);
                }
            }
        }
    }
}

// --- DATA SECTION: UPDATE THESE MATRICES ---
// 1 = Raised (Black), 0 = Empty (White Base shows through)
function get_marker_bits(id) = 
    (id == 0) ? [
        [1,0,1,0,1,0], // Row 0 (Top)
        [0,1,0,1,0,1],
        [1,0,1,0,1,0],
        [0,1,0,1,0,1],
        [1,0,1,0,1,0],
        [0,1,0,1,0,1]  // Row 5 (Bottom)
    ] :
    (id == 1) ? [
        [1,1,0,0,1,1], 
        [1,1,0,0,1,1],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [1,1,0,0,1,1],
        [1,1,0,0,1,1]
    ] :
    (id == 2) ? [
        [1,1,1,0,0,0], 
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,1,1,0,0,0]
    ] :
    (id == 3) ? [
        [0,0,0,1,1,1], 
        [0,0,0,0,0,1],
        [0,0,0,0,0,1],
        [0,0,0,0,0,1],
        [0,0,0,0,0,1],
        [0,0,0,1,1,1]
    ] : []; // Default empty

main();