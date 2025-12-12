import cv2
import cv2.aruco as aruco
import numpy as np
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
import os

# --- Configuration ---
OUTPUT_FILENAME = "pokemon_card_scanning_mat.pdf"
MARKER_SIZE_MM = 20
CARD_WIDTH_MM = 63.5
CARD_HEIGHT_MM = 88.9
GAP_MM = 10  # Gap between card and markers
# Using ARUCO_MIP_36h12 dictionary (AprilTag-style markers)
# This dictionary has better detection at various angles and distances
# js-aruco2 library supports both 'ARUCO' and 'ARUCO_MIP_36h12'
DICT_ID = aruco.DICT_ARUCO_MIP_36h12


def generate_marker(id, size_pixels=200):
    """
    Generate an ArUco marker image.

    Note: Using DICT_ARUCO_MIP_36h12 which is an AprilTag-style dictionary
    optimized for better detection at various angles and lighting conditions.
    js-aruco2 library supports this dictionary with the name 'ARUCO_MIP_36h12'.
    This dictionary has 250 unique markers (IDs 0-249).
    """
    dictionary = aruco.getPredefinedDictionary(DICT_ID)
    marker_img = aruco.generateImageMarker(dictionary, id, size_pixels)
    return marker_img


def create_mat_pdf():
    c = canvas.Canvas(OUTPUT_FILENAME, pagesize=letter)
    width, height = letter

    # Calculate Center
    center_x = width / 2
    center_y = height / 2

    # Draw Card Outline (Dashed)
    c.setDash(3, 3)
    c.setLineWidth(1)
    card_w_pt = CARD_WIDTH_MM * mm
    card_h_pt = CARD_HEIGHT_MM * mm

    # Draw the rectangle where the card goes
    c.rect(center_x - card_w_pt / 2, center_y - card_h_pt / 2, card_w_pt, card_h_pt)

    # Add Label
    c.setFont("Helvetica", 10)
    c.drawCentredString(center_x, center_y, "Place Pokemon Card Here")

    # --- Place ArUco Markers ---
    # We place them at the 4 corners outside the gap
    # Order: TL (0), TR (1), BR (2), BL (3) - Standard Z pattern or Clockwise
    # Let's do Clockwise from TL: 0, 1, 2, 3

    marker_ids = [0, 1, 2, 3]
    marker_size_pt = MARKER_SIZE_MM * mm

    # Offsets from center to the center of the markers
    x_offset = (CARD_WIDTH_MM / 2 + GAP_MM + MARKER_SIZE_MM / 2) * mm
    y_offset = (CARD_HEIGHT_MM / 2 + GAP_MM + MARKER_SIZE_MM / 2) * mm

    positions = [
        (-x_offset, y_offset),  # TL
        (x_offset, y_offset),  # TR
        (x_offset, -y_offset),  # BR
        (-x_offset, -y_offset),  # BL
    ]

    temp_img_files = []

    for i, (m_id, pos) in enumerate(zip(marker_ids, positions)):
        # Generate marker image
        img = generate_marker(m_id)
        temp_filename = f"temp_marker_{m_id}.png"
        cv2.imwrite(temp_filename, img)
        temp_img_files.append(temp_filename)

        # Calculate drawing position (bottom-left of the image)
        # pos is center relative to page center
        draw_x = center_x + pos[0] - marker_size_pt / 2
        draw_y = center_y + pos[1] - marker_size_pt / 2

        c.drawImage(
            temp_filename, draw_x, draw_y, width=marker_size_pt, height=marker_size_pt
        )

        # Label the marker ID for debugging
        c.drawString(draw_x, draw_y - 10, f"ID: {m_id}")

    c.showPage()
    c.save()

    # Cleanup temp files
    for f in temp_img_files:
        if os.path.exists(f):
            os.remove(f)

    print(f"Successfully generated {OUTPUT_FILENAME}")


if __name__ == "__main__":
    create_mat_pdf()
