import cv2
import cv2.aruco as aruco
import numpy as np

# Use the specific 36h12 dictionary
aruco_dict = aruco.getPredefinedDictionary(aruco.DICT_ARUCO_MIP_36h12)

print("// Paste these matrices into the get_marker_bits function in OpenSCAD")
print("// 1 = Raised (Black/Marker Color), 0 = Recessed (White/Base Color)\n")

for id in [0, 1, 2, 3]:
    # Generate the marker image (6x6 pixels + 1 bit border)
    # We generate it small so we can read the pixels directly
    img = aruco.drawMarker(aruco_dict, id, 8, 1)

    # Crop to just the inner 6x6 grid (remove the black border)
    # The border is 1 pixel wide, so we take from index 1 to 7
    inner_grid = img[1:7, 1:7]

    # Convert to 0 and 1
    # In the image: 0 is Black, 255 is White.
    # In OpenSCAD: We want 1 for Black (Raised), 0 for White (Empty).
    # So we invert the logic: (pixel < 128) becomes 1.
    bits = (inner_grid < 128).astype(int)

    print(f"// ID {id}")
    print(f"(id == {id}) ? [")
    for row in bits:
        # Format as OpenSCAD array: [1, 0, 1, ...]
        line = "[" + ",".join(map(str, row)) + "],"
        print(f"    {line}")
    print("] :")
