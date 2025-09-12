#!/usr/bin/env python3
"""
Video layout optimization for streamer content
"""

import cv2
import numpy as np
import os
from typing import Dict, List, Any, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# Configuration
OUT_W, OUT_H = 1080, 1920       # 9:16 canvas
TOP_H = 420                      # room for face-cam
BOT_H = 320                      # room for captions
MID_H = OUT_H - TOP_H - BOT_H    # gameplay area height
FPS_STABILIZE_FRAMES = 60        # frames to search for face-cam at start
FACE_SCORE_THR = 0.6
GAME_ASPECT = 16/9

def detect_face_box(frame_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """
    Return (x,y,w,h) of the likely face-cam box in the frame, or None.
    Uses OpenCV's built-in face detection for better compatibility.
    """
    try:
        # Use OpenCV's built-in Haar cascade for face detection
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        if not os.path.exists(cascade_path):
            logger.warning(f"Face detection cascade not found: {cascade_path}")
            return None
            
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            logger.warning("Failed to load face detection cascade")
            return None
        
        h, w = frame_bgr.shape[:2]
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )
        
        if len(faces) == 0:
            return None
            
        # Pick the smallest face (likely the webcam, not a game character)
        boxes = [(x, y, w, h) for (x, y, w, h) in faces]
        
        # Sort by area and pick the smallest reasonable one
        boxes.sort(key=lambda b: b[2] * b[3])
        
        for x, y, fw, fh in boxes:
            # Skip faces that are too large (probably game characters)
            if fw * fh > (w * h) * 0.15:  # Skip if face is > 15% of frame
                continue
                
            # Expand to include the visible webcam panel/frame around the face
            pad = int(max(fw, fh) * 0.8)  # generous padding
            cx, cy = x + fw//2, y + fh//2
            W = int(fw * 2.2)
            H = int(fh * 2.2)
            X = max(0, cx - W//2)
            Y = max(0, cy - H//2)
            W = min(W, w - X)
            H = min(H, h - Y)
            
            return (X, Y, W, H)
            
        return None
        
    except Exception as e:
        logger.warning(f"Face detection failed: {e}")
        return None

def best_gameplay_crop(frame_bgr: np.ndarray, exclude: Optional[Tuple[int, int, int, int]] = None, aspect: float = GAME_ASPECT) -> Tuple[int, int, int, int]:
    """
    Find a high-detail area not overlapping the face-cam and return an
    aspect-locked crop (x,y,w,h). Fallback: full frame minus exclude.
    """
    h, w = frame_bgr.shape[:2]
    
    # Validate frame dimensions
    if h <= 0 or w <= 0:
        logger.error(f"Invalid frame dimensions: {w}x{h}")
        return (0, 0, max(1, w), max(1, h))
    
    # Validate aspect ratio
    if aspect <= 0:
        logger.warning(f"Invalid aspect ratio: {aspect}, using default")
        aspect = GAME_ASPECT
    
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    
    # Detail map (edges)
    edges = cv2.Laplacian(gray, cv2.CV_64F)
    edges = cv2.convertScaleAbs(edges)
    mask = np.ones((h, w), dtype=np.uint8) * 255

    if exclude is not None:
        x, y, ew, eh = exclude
        # Clamp exclude bounds to frame
        x = max(0, min(x, w-1))
        y = max(0, min(y, h-1))
        ew = max(1, min(ew, w-x))
        eh = max(1, min(eh, h-y))
        mask[y:y+eh, x:x+ew] = 0

    # Downscale for speed
    s = 4
    small_w, small_h = max(1, w//s), max(1, h//s)
    e_small = cv2.resize(edges, (small_w, small_h))
    m_small = cv2.resize(mask, (small_w, small_h), interpolation=cv2.INTER_NEAREST)

    # Sliding window search over a few scales
    best = None
    for scale in [0.9, 0.8, 0.7, 0.6]:
        W = int(small_w * scale)
        if W <= 0:
            continue
        H = int(W / aspect)
        if H <= 0:
            continue
        if H > small_h:
            H = small_h
            W = int(H * aspect)
            if W <= 0:
                continue
        
        # Ensure we have valid step sizes
        step_y = max(1, max(8, H//10))
        step_x = max(1, max(8, W//10))
        
        y_end = max(1, small_h - H + 1)
        x_end = max(1, small_w - W + 1)
        
        for yy in range(0, y_end, step_y):
            for xx in range(0, x_end, step_x):
                win_e = e_small[yy:yy+H, xx:xx+W]
                win_m = m_small[yy:yy+H, xx:xx+W]
                if win_m.mean() < 220:  # too much overlap with excluded region
                    continue
                score = win_e.mean()
                if not best or score > best[0]:
                    best = (score, xx, yy, W, H)

    if best:
        _, xx, yy, W, H = best
        # map back to full-res coordinates
        X, Y, WW, HH = xx*s, yy*s, W*s, H*s
        return (X, Y, WW, HH)

    # Fallback: full frame minus face-cam, aspect locked and centered
    if aspect <= 0:
        aspect = GAME_ASPECT
    
    WW = int(min(w, h*aspect))
    if WW <= 0:
        WW = w
    HH = int(WW / aspect)
    if HH <= 0:
        HH = h
    
    X = max(0, (w - WW)//2)
    Y = max(0, (h - HH)//2)
    return (X, Y, WW, HH)

def analyze_video_layout(video_path: str, num_samples: int = 20, use_cache: bool = True) -> Dict[str, Any]:
    """
    Analyze a video to determine optimal face-cam and gameplay crop areas.
    Returns layout configuration for consistent processing.
    
    Args:
        video_path: Path to the video file
        num_samples: Number of frames to sample for analysis
        use_cache: Whether to use cached results if available
    """
    try:
        # Simple cache based on file path and modification time
        cache_key = f"{video_path}_{os.path.getmtime(video_path) if os.path.exists(video_path) else 0}"
        cache_file = f"/tmp/layout_cache_{hash(cache_key) % 1000000}.json"
        
        if use_cache and os.path.exists(cache_file):
            try:
                import json
                with open(cache_file, 'r') as f:
                    cached_result = json.load(f)
                logger.info(f"Using cached layout analysis for {video_path}")
                return cached_result
            except Exception as e:
                logger.warning(f"Failed to load cached layout: {e}")
        
        logger.info(f"Performing fresh layout analysis for {video_path}")
        
        return _perform_layout_analysis(video_path, num_samples, cache_file, use_cache)
        
    except Exception as e:
        logger.error(f"Layout analysis failed with error: {e}")
        # Return safe fallback
        return {
            "face_cam": None,
            "game_crop": None,
            "video_size": None,
            "total_frames": 0,
            "fps": 30,  # Safe default
            "duration": 0,
            "error": f"Analysis failed: {str(e)}"
        }

def _perform_layout_analysis(video_path: str, num_samples: int, cache_file: str, use_cache: bool) -> Dict[str, Any]:
    """Internal function to perform the actual layout analysis"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Could not open video: {video_path}")
        return {"face_cam": None, "game_crop": None, "error": "Could not open video"}
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    # Validate video properties
    if total_frames <= 0:
        logger.error(f"Invalid frame count: {total_frames}")
        cap.release()
        return {"face_cam": None, "game_crop": None, "error": "Invalid video frame count"}
    
    if fps <= 0:
        logger.error(f"Invalid FPS: {fps}")
        cap.release()
        return {"face_cam": None, "game_crop": None, "error": "Invalid video FPS"}
    
    duration = total_frames / fps
    
    # Get video dimensions BEFORE processing frames
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_size = (frame_width, frame_height)
    
    logger.info(f"Analyzing video layout: {total_frames} frames, {fps} fps, {duration:.1f}s, {frame_width}x{frame_height}")
    
    # Sample frames evenly throughout the video
    if total_frames <= 1:
        sample_frames = np.array([0])
    else:
        sample_frames = np.linspace(0, min(total_frames - 1, FPS_STABILIZE_FRAMES), num=min(num_samples, total_frames)).astype(int)
    
    face_detections = []
    sample_frame = None
    
    for frame_idx in sample_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue
            
        # Store a representative frame for gameplay analysis
        if sample_frame is None:
            sample_frame = frame.copy()
            
        # Detect face in this frame
        face_box = detect_face_box(frame)
        if face_box:
            face_detections.append(face_box)
    
    cap.release()
    
    # Determine stable face-cam location
    face_cam = None
    if face_detections:
        # Use median values for robustness
        Xs, Ys, Ws, Hs = zip(*face_detections)
        face_cam = (
            int(np.median(Xs)),
            int(np.median(Ys)),
            int(np.median(Ws)),
            int(np.median(Hs))
        )
        logger.info(f"Detected face-cam at: {face_cam}")
    else:
        logger.info("No face-cam detected")
    
    # Determine optimal gameplay crop
    game_crop = None
    if sample_frame is not None:
        game_crop = best_gameplay_crop(sample_frame, exclude=face_cam, aspect=GAME_ASPECT)
        logger.info(f"Optimal gameplay crop: {game_crop}")
    
    result = {
        "face_cam": face_cam,
        "game_crop": game_crop,
        "video_size": video_size,
        "total_frames": total_frames,
        "fps": fps,
        "duration": duration
    }
    
    # Cache the result for future use
    if use_cache:
        try:
            import json
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, 'w') as f:
                json.dump(result, f)
            logger.info(f"Cached layout analysis to {cache_file}")
        except Exception as e:
            logger.warning(f"Failed to cache layout analysis: {e}")
    
    return result

def create_optimized_layout_filter(face_cam: Optional[Tuple[int, int, int, int]], 
                                 game_crop: Optional[Tuple[int, int, int, int]],
                                 video_size: Tuple[int, int]) -> str:
    """
    Create FFmpeg filter string for optimized layout with face-cam and gameplay areas.
    Returns a complex filter that creates a 9:16 layout.
    """
    w, h = video_size
    
    filters = []
    
    if game_crop and face_cam:
        # Both face-cam and gameplay crop
        gx, gy, gw, gh = game_crop
        fx, fy, fw, fh = face_cam
        
        # Create gameplay crop and scale to middle area
        filters.append(f"[0:v]crop={gw}:{gh}:{gx}:{gy}[game]")
        filters.append(f"[game]scale={OUT_W}:{MID_H}[game_scaled]")
        
        # Create face-cam crop and scale for top area
        face_scale = min((TOP_H-40)/fh, (OUT_W-40)/fw)
        face_w, face_h = int(fw * face_scale), int(fh * face_scale)
        face_x, face_y = (OUT_W - face_w)//2, (TOP_H - face_h)//2
        
        filters.append(f"[0:v]crop={fw}:{fh}:{fx}:{fy}[face]")
        filters.append(f"[face]scale={face_w}:{face_h}[face_scaled]")
        
        # Create black canvas and composite
        filters.append(f"color=black:{OUT_W}x{OUT_H}:duration=1[bg]")
        filters.append(f"[bg][game_scaled]overlay=0:{TOP_H}[with_game]")
        filters.append(f"[with_game][face_scaled]overlay={face_x}:{face_y}[final]")
        
        return ";".join(filters)
        
    elif game_crop:
        # Only gameplay crop (no face-cam detected)
        gx, gy, gw, gh = game_crop
        
        filters.append(f"[0:v]crop={gw}:{gh}:{gx}:{gy}[game]")
        filters.append(f"[game]scale={OUT_W}:{MID_H}[game_scaled]")
        filters.append(f"color=black:{OUT_W}x{OUT_H}:duration=1[bg]")
        filters.append(f"[bg][game_scaled]overlay=0:{TOP_H}[final]")
        
        return ";".join(filters)
    
    else:
        # No optimization - just scale and pad to 9:16
        filters.append(f"[0:v]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease[scaled]")
        filters.append(f"color=black:{OUT_W}x{OUT_H}:duration=1[bg]")
        filters.append(f"[bg][scaled]overlay=(W-w)/2:(H-h)/2[final]")
        
        return ";".join(filters)

def get_layout_info(layout_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get human-readable information about the detected layout.
    """
    try:
        info = {
            "has_face_cam": layout_config.get("face_cam") is not None,
            "has_gameplay_optimization": layout_config.get("game_crop") is not None,
            "video_duration": layout_config.get("duration", 0),
            "analysis_success": "error" not in layout_config
        }
        
        if layout_config.get("face_cam") and layout_config.get("video_size"):
            fx, fy, fw, fh = layout_config["face_cam"]
            video_w, video_h = layout_config["video_size"]
            
            # Prevent division by zero
            if video_w > 0 and video_h > 0 and fw > 0 and fh > 0:
                info["face_cam_area_percent"] = (fw * fh) / (video_w * video_h) * 100
                info["face_cam_position"] = f"{fx},{fy} ({fw}x{fh})"
            else:
                logger.warning(f"Invalid face cam or video dimensions: face=({fw}x{fh}), video=({video_w}x{video_h})")
        
        if layout_config.get("game_crop") and layout_config.get("video_size"):
            gx, gy, gw, gh = layout_config["game_crop"]
            video_w, video_h = layout_config["video_size"]
            
            # Prevent division by zero
            if video_w > 0 and video_h > 0 and gw > 0 and gh > 0:
                info["gameplay_crop_area_percent"] = (gw * gh) / (video_w * video_h) * 100
                info["gameplay_crop_position"] = f"{gx},{gy} ({gw}x{gh})"
            else:
                logger.warning(f"Invalid game crop or video dimensions: crop=({gw}x{gh}), video=({video_w}x{video_h})")
        
        return info
        
    except Exception as e:
        logger.error(f"Error in get_layout_info: {e}")
        return {
            "has_face_cam": False,
            "has_gameplay_optimization": False,
            "video_duration": 0,
            "analysis_success": False,
            "error": f"Layout info failed: {str(e)}"
        }