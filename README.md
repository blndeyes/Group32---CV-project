# Group32---CV-project

CS436 – Computer Vision Fundamentals
Group 32 – Structure-from-Motion + Virtual Tour Viewer
This repository contains our implementation for the CS436 project. The work is split into the two reconstruction phases required for the course, plus a final interactive 3D virtual tour built using Three.js. The final reconstruction is based on Agisoft Metashape outputs because the incremental SfM pipeline (Phase 2) accumulated drift.

Phase 1 — Two-View SfM

Phase 2 — Incremental SfM (Implementation Attempt)

Final Reconstruction
Because incremental drift made the map unstable, Agisoft Metashape was used for:
Dense matching over 32 images
Bundle adjustment
Export of clean point cloud (PLY)
Export of optimized camera poses as 4×4 matrices
Virtual Tour Viewer (Three.js)
Recommended libraries:
numpy
opencv-python
matplotlib
scipy
tqdm
scikit-image (optional)
Viewer (Web App)
Three.js r128
A local HTTP server (Python, Node, or VSCode’s Live Server)
No additional build tools required.
Repository Structure:

3d_virtual_app/
    app.js
    camera_positions.xml
    cameras.json
    index.html
    parse_cameras.py
    style.css

submissions/
    week2/
        group32.ply
        phase1.ipynb
        un.txt
    week3/
        phase2.ipynb
        reconstruction_initial.ply
        reconstruction_refined.ply
        untitled.txt

AI_Report
README.md

Running Phase 1:
submissions/week2/phase1.ipynb

Dependencies:
numpy
opencv-python
matplotlib
scipy

Command:
jupyter notebook submissions/week2/phase1.ipynb
This produces two PLY files:
reconstruction_initial.ply
reconstruction_refined.ply
(Note: These are not used in the final viewer because of drift.)

Running Phase 3:
submissions/week3/phase2.ipynb

Dependencies:
numpy
opencv-python
matplotlib
scipy
Command:
jupyter notebook submissions/week3/phase2.ipynb

Running the Web Viewer:

Commands:
cd 3d_virtual_app
python -m http.server 8000 //this line is to start the local server
http://localhost:8000/index.html

Authors:

Group 32
M. Walid Khalid - 26100259
Sarmad Sultan - 26100179
LUMS, CS436


