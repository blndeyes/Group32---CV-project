#!/usr/bin/env python3
"""
Camera Position Parser for Three.js Virtual Tour
Parses Agisoft XML camera data and converts to JSON format suitable for Three.js
"""

import xml.etree.ElementTree as ET
import numpy as np
import json
import sys


def parse_transform_matrix(transform_str):
    """
    Parse a 4x4 transformation matrix from space-separated string.
    The matrix is stored in row-major order.
    
    Returns:
        R: 3x3 rotation matrix
        t: 3x1 translation vector
    """
    values = [float(x) for x in transform_str.strip().split()]
    
    if len(values) != 16:
        raise ValueError(f"Expected 16 values, got {len(values)}")
    
    # Reshape into 4x4 matrix (row-major)
    matrix = np.array(values).reshape(4, 4)
    
    # Extract rotation (top-left 3x3) and translation (top-right 3x1)
    R = matrix[:3, :3]
    t = matrix[:3, 3]
    
    return R, t


def compute_camera_center(R, t):
    """
    Compute the actual camera center in world coordinates.
    
    The translation vector 't' in the camera matrix is NOT the camera position.
    The actual camera center C is: C = -R^T * t
    
    Args:
        R: 3x3 rotation matrix
        t: 3x1 translation vector
        
    Returns:
        C: 3x1 camera center in world coordinates
    """
    C = -R.T @ t
    return C


def parse_camera_xml(xml_file):
    """
    Parse the Agisoft camera XML file and extract camera poses.
    
    Returns:
        List of camera dictionaries with all necessary data
    """
    tree = ET.parse(xml_file)
    root = tree.getroot()
    
    cameras = []
    
    # Find all camera elements
    for camera in root.findall('.//camera'):
        # Skip disabled cameras
        enabled = camera.get('enabled', 'true')
        if enabled == 'false':
            continue
        
        camera_id = camera.get('id')
        label = camera.get('label', f'Camera_{camera_id}')
        
        # Get transform element
        transform_elem = camera.find('transform')
        if transform_elem is None:
            print(f"Warning: Camera {camera_id} has no transform, skipping")
            continue
        
        transform_str = transform_elem.text
        
        try:
            # Parse the transformation matrix
            R, t = parse_transform_matrix(transform_str)
            
            # Compute the actual camera center
            C = compute_camera_center(R, t)
            
            # Store camera data
            camera_data = {
                'id': int(camera_id),
                'label': label,
                'rotation': R.tolist(),
                'translation': t.tolist(),
                'center': C.tolist(),
                # Store the full 4x4 matrix for convenience
                'matrix': np.vstack([np.hstack([R, t.reshape(-1, 1)]), 
                                    [0, 0, 0, 1]]).tolist()
            }
            
            cameras.append(camera_data)
            
        except Exception as e:
            print(f"Error parsing camera {camera_id}: {e}")
            continue
    
    print(f"Successfully parsed {len(cameras)} cameras")
    return cameras


def save_cameras_json(cameras, output_file):
    """
    Save camera data to JSON file in a format suitable for Three.js.
    """
    output_data = {
        'cameras': cameras,
        'metadata': {
            'total_cameras': len(cameras),
            'description': 'Camera poses for virtual tour navigation',
            'coordinate_system': 'Right-handed, Y-up (Three.js compatible)'
        }
    }
    
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    print(f"Camera data saved to: {output_file}")


def print_camera_stats(cameras):
    """
    Print statistics about the parsed cameras.
    """
    if not cameras:
        return
    
    centers = np.array([cam['center'] for cam in cameras])
    
    print("\n=== Camera Statistics ===")
    print(f"Number of cameras: {len(cameras)}")
    print(f"\nCamera center bounds:")
    print(f"  X: [{centers[:, 0].min():.3f}, {centers[:, 0].max():.3f}]")
    print(f"  Y: [{centers[:, 1].min():.3f}, {centers[:, 1].max():.3f}]")
    print(f"  Z: [{centers[:, 2].min():.3f}, {centers[:, 2].max():.3f}]")
    print(f"\nScene center (mean): [{centers.mean(axis=0)[0]:.3f}, "
          f"{centers.mean(axis=0)[1]:.3f}, {centers.mean(axis=0)[2]:.3f}]")
    
    # Calculate pairwise distances
    distances = []
    for i in range(len(centers)):
        for j in range(i + 1, len(centers)):
            dist = np.linalg.norm(centers[i] - centers[j])
            distances.append(dist)
    
    if distances:
        print(f"\nCamera spacing:")
        print(f"  Min distance: {min(distances):.3f}")
        print(f"  Max distance: {max(distances):.3f}")
        print(f"  Mean distance: {np.mean(distances):.3f}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_cameras.py <input_xml> [output_json]")
        print("\nExample:")
        print("  python parse_cameras.py camera_positions.xml cameras.json")
        sys.exit(1)
    
    input_xml = sys.argv[1]
    output_json = sys.argv[2] if len(sys.argv) > 2 else 'cameras.json'
    
    print(f"Parsing camera data from: {input_xml}")
    print("-" * 50)
    
    try:
        cameras = parse_camera_xml(input_xml)
        
        if not cameras:
            print("Error: No cameras were parsed successfully")
            sys.exit(1)
        
        print_camera_stats(cameras)
        
        save_cameras_json(cameras, output_json)
        
        print("\n✓ Parsing complete!")
        print(f"\nNext steps:")
        print(f"  1. Place {output_json} in the same directory as your HTML file")
        print(f"  2. Open index.html in a web browser")
        print(f"  3. Navigate between camera positions in the virtual tour")
        
    except FileNotFoundError:
        print(f"Error: Could not find file: {input_xml}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
