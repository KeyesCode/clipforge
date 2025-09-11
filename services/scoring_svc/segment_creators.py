#!/usr/bin/env python3
"""
Segment creation functions for content-aware highlight detection
"""

from typing import Dict, List, Any, Tuple
import math

def create_speech_based_segments(transcription_segments: List[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    """Create highlight segments based on speech content"""
    segments = []
    
    if not transcription_segments:
        return segments
    
    # Group segments by intensity (high-energy speech)
    for seg in transcription_segments:
        text = seg.get("text", "").lower()
        
        # Look for high-intensity speech patterns
        intensity_keywords = ["wow", "amazing", "incredible", "perfect", "insane", "unbelievable", 
                            "clutch", "epic", "awesome", "brilliant", "outstanding"]
        excitement_keywords = ["oh my god", "holy", "damn", "shit", "fuck", "yes!", "no way", 
                             "are you kidding", "you've got to be"]
        
        intensity_score = sum(1 for keyword in intensity_keywords if keyword in text)
        excitement_score = sum(2 for keyword in excitement_keywords if keyword in text)  # Higher weight
        
        if intensity_score > 0 or excitement_score > 0 or len(text) > 100:
            # Create segment around this speech
            segment_start = max(0, seg["start"] - 5)  # 5 seconds before speech
            segment_end = min(duration, seg["end"] + 10)  # 10 seconds after speech
            
            segments.append({
                "startTime": segment_start,
                "duration": segment_end - segment_start,
                "type": "speech_based",
                "source_intensity": intensity_score,
                "source_excitement": excitement_score,
                "source_text": text[:100],
                "reason": f"High-intensity speech: '{text[:50]}...'"
            })
    
    return segments

def create_audio_peak_segments(audio_peaks: List[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    """Create highlight segments based on audio energy peaks"""
    segments = []
    
    for peak in audio_peaks:
        # Create optimal segment around audio peak
        peak_time = peak.get("peak_time", (peak["start"] + peak["end"]) / 2)
        intensity = peak.get("intensity", 0.5)
        
        # Segment length based on intensity (higher intensity = longer segment)
        base_duration = 15 + (intensity * 15)  # 15-30 seconds
        segment_start = max(0, peak_time - base_duration * 0.3)  # Start a bit before peak
        segment_duration = min(base_duration, duration - segment_start)
        
        segments.append({
            "startTime": segment_start,
            "duration": segment_duration,
            "type": f"audio_{peak.get('type', 'peak')}",
            "source_intensity": intensity,
            "source_peak_time": peak_time,
            "reason": f"Audio {peak.get('type', 'peak')} detected (intensity: {intensity:.2f})"
        })
    
    return segments

def create_vision_event_segments(vision_events: List[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    """Create highlight segments based on vision events"""
    segments = []
    
    for event in vision_events:
        event_type = event.get("type", "visual")
        intensity = event.get("intensity", event.get("confidence", 0.5))
        
        # Adjust segment based on event type
        if event_type == "scene_change":
            # Scene changes might indicate action transitions
            segment_start = max(0, event["start"] - 3)
            segment_duration = min(20, duration - segment_start)
        elif event_type == "motion":
            # High motion periods
            segment_start = event["start"]
            segment_duration = min(25, event["end"] - event["start"])
        elif event_type == "face_detected":
            # Face detection might indicate reaction moments
            segment_start = max(0, event["start"] - 2)
            segment_duration = min(15, duration - segment_start)
        else:
            # Generic visual event
            segment_start = event["start"]
            segment_duration = min(20, event["end"] - event["start"])
        
        segments.append({
            "startTime": segment_start,
            "duration": segment_duration,
            "type": f"vision_{event_type}",
            "source_intensity": intensity,
            "reason": f"Visual event: {event_type} (confidence: {intensity:.2f})"
        })
    
    return segments

def create_fusion_segments(transcription_segments: List[Dict[str, Any]], 
                         audio_peaks: List[Dict[str, Any]], 
                         vision_events: List[Dict[str, Any]], 
                         duration: float) -> List[Dict[str, Any]]:
    """Create segments by fusing multiple data sources"""
    segments = []
    
    # Find temporal overlaps between different modalities
    all_events = []
    
    # Add transcription events
    for seg in transcription_segments:
        all_events.append({
            "start": seg["start"],
            "end": seg["end"],
            "type": "speech",
            "data": seg
        })
    
    # Add audio events
    for peak in audio_peaks:
        peak_time = peak.get("peak_time", (peak["start"] + peak["end"]) / 2)
        all_events.append({
            "start": peak["start"],
            "end": peak["end"],
            "type": "audio",
            "data": peak,
            "peak_time": peak_time
        })
    
    # Add vision events
    for event in vision_events:
        all_events.append({
            "start": event["start"],
            "end": event["end"],
            "type": "vision",
            "data": event
        })
    
    # Sort events by start time
    all_events.sort(key=lambda x: x["start"])
    
    # Find clusters of events that occur close together
    clusters = find_event_clusters(all_events, max_gap=10.0)  # Events within 10 seconds
    
    # Create fusion segments from clusters
    for cluster in clusters:
        if len(cluster) >= 2:  # At least 2 different types of events
            cluster_start = min(event["start"] for event in cluster)
            cluster_end = max(event["end"] for event in cluster)
            
            # Expand segment to create good highlight
            segment_start = max(0, cluster_start - 5)
            segment_end = min(duration, cluster_end + 8)
            segment_duration = segment_end - segment_start
            
            # Calculate fusion score based on event types and overlap
            fusion_score = calculate_fusion_score(cluster)
            
            if segment_duration >= 10 and fusion_score > 0.3:  # Minimum requirements
                segments.append({
                    "startTime": segment_start,
                    "duration": segment_duration,
                    "type": "multi_modal_fusion",
                    "source_events": len(cluster),
                    "source_types": list(set(event["type"] for event in cluster)),
                    "fusion_score": fusion_score,
                    "reason": f"Multi-modal event cluster ({len(cluster)} events: {', '.join(set(e['type'] for e in cluster))})"
                })
    
    return segments

def find_event_clusters(events: List[Dict[str, Any]], max_gap: float = 10.0) -> List[List[Dict[str, Any]]]:
    """Group events that occur close together in time"""
    if not events:
        return []
    
    clusters = []
    current_cluster = [events[0]]
    
    for i in range(1, len(events)):
        current_event = events[i]
        last_event = current_cluster[-1]
        
        # Check if this event is close enough to the last event in current cluster
        gap = current_event["start"] - last_event["end"]
        
        if gap <= max_gap:
            current_cluster.append(current_event)
        else:
            # Start a new cluster
            if len(current_cluster) > 0:
                clusters.append(current_cluster)
            current_cluster = [current_event]
    
    # Add the last cluster
    if len(current_cluster) > 0:
        clusters.append(current_cluster)
    
    return clusters

def calculate_fusion_score(event_cluster: List[Dict[str, Any]]) -> float:
    """Calculate a score for a cluster of multi-modal events"""
    if not event_cluster:
        return 0.0
    
    score = 0.0
    
    # Bonus for having multiple modalities
    unique_types = set(event["type"] for event in event_cluster)
    modality_bonus = len(unique_types) * 0.15  # 0.15 per unique modality
    score += modality_bonus
    
    # Bonus for temporal density (events close together)
    if len(event_cluster) > 1:
        cluster_start = min(event["start"] for event in event_cluster)
        cluster_end = max(event["end"] for event in event_cluster)
        cluster_duration = cluster_end - cluster_start
        
        if cluster_duration > 0:
            density = len(event_cluster) / cluster_duration
            density_bonus = min(density * 0.1, 0.3)  # Cap at 0.3
            score += density_bonus
    
    # Individual event quality
    for event in event_cluster:
        event_data = event.get("data", {})
        
        if event["type"] == "speech":
            # Quality based on text content
            text = event_data.get("text", "").lower()
            if any(word in text for word in ["amazing", "incredible", "wow", "perfect", "insane"]):
                score += 0.2
        
        elif event["type"] == "audio":
            # Quality based on intensity
            intensity = event_data.get("intensity", 0.5)
            score += intensity * 0.15
        
        elif event["type"] == "vision":
            # Quality based on confidence/intensity
            confidence = event_data.get("intensity", event_data.get("confidence", 0.5))
            score += confidence * 0.1
    
    return min(score, 1.0)  # Cap at 1.0

def score_highlight_segment(segment: Dict[str, Any], chunk: Any, 
                          transcription_segments: List[Dict[str, Any]],
                          audio_peaks: List[Dict[str, Any]], 
                          vision_events: List[Dict[str, Any]]) -> float:
    """Score a highlight segment based on content and context"""
    score = 0.0
    
    # Base score from segment type
    segment_type = segment.get("type", "unknown")
    if segment_type.startswith("speech"):
        score += 0.3
    elif segment_type.startswith("audio"):
        score += 0.25
    elif segment_type.startswith("vision"):
        score += 0.2
    elif segment_type == "multi_modal_fusion":
        score += 0.4
    
    # Bonus from source intensity/excitement
    score += segment.get("source_intensity", 0) * 0.1
    score += segment.get("source_excitement", 0) * 0.15
    
    # Fusion-specific bonuses
    if segment_type == "multi_modal_fusion":
        score += segment.get("fusion_score", 0) * 0.3
        score += len(segment.get("source_types", [])) * 0.05
    
    # Duration penalty for very short or very long segments
    duration = segment.get("duration", 0)
    if duration < 5:
        score *= 0.3  # Heavy penalty for very short
    elif duration < 10:
        score *= 0.7  # Moderate penalty for short
    elif duration > 45:
        score *= 0.8  # Slight penalty for long
    
    # Context bonuses (overlap with other events)
    context_bonus = calculate_context_bonus(segment, transcription_segments, audio_peaks, vision_events)
    score += context_bonus
    
    return min(score, 1.0)

def calculate_context_bonus(segment: Dict[str, Any],
                          transcription_segments: List[Dict[str, Any]],
                          audio_peaks: List[Dict[str, Any]], 
                          vision_events: List[Dict[str, Any]]) -> float:
    """Calculate bonus score based on context and overlaps with other events"""
    bonus = 0.0
    segment_start = segment["startTime"]
    segment_end = segment_start + segment["duration"]
    
    # Check for overlaps with transcription segments
    for trans_seg in transcription_segments:
        if overlaps(segment_start, segment_end, trans_seg["start"], trans_seg["end"]):
            text = trans_seg.get("text", "").lower()
            if any(word in text for word in ["clip", "highlight", "amazing", "incredible", "perfect"]):
                bonus += 0.1
    
    # Check for overlaps with audio peaks
    for peak in audio_peaks:
        if overlaps(segment_start, segment_end, peak["start"], peak["end"]):
            bonus += peak.get("intensity", 0.5) * 0.05
    
    # Check for overlaps with vision events
    for event in vision_events:
        if overlaps(segment_start, segment_end, event["start"], event["end"]):
            bonus += event.get("intensity", event.get("confidence", 0.5)) * 0.03
    
    return min(bonus, 0.3)  # Cap bonus

def overlaps(start1: float, end1: float, start2: float, end2: float) -> bool:
    """Check if two time intervals overlap"""
    return start1 < end2 and start2 < end1

def calculate_segment_confidence(segment: Dict[str, Any], chunk: Any) -> float:
    """Calculate confidence score for a segment"""
    confidence = 0.5  # Base confidence
    
    # Boost confidence based on segment characteristics
    if segment.get("type") == "multi_modal_fusion":
        confidence += 0.3  # High confidence for fusion segments
    
    if segment.get("source_excitement", 0) > 0:
        confidence += 0.2  # High confidence for excitement
    
    if segment.get("source_intensity", 0) > 0.7:
        confidence += 0.1  # Boost for high intensity
    
    # Duration-based confidence
    duration = segment.get("duration", 0)
    if 15 <= duration <= 30:  # Optimal duration range
        confidence += 0.1
    
    return min(confidence, 1.0)

def remove_overlapping_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove overlapping segments, keeping the highest scoring ones"""
    if not segments:
        return segments
    
    # Sort by score descending
    sorted_segments = sorted(segments, key=lambda x: x.get("score", 0), reverse=True)
    
    final_segments = []
    
    for segment in sorted_segments:
        start = segment["startTime"]
        end = start + segment["duration"]
        
        # Check if this segment overlaps significantly with any already selected segment
        overlaps_existing = False
        for existing in final_segments:
            existing_start = existing["startTime"]
            existing_end = existing_start + existing["duration"]
            
            # Check for significant overlap (>50% of either segment)
            overlap_start = max(start, existing_start)
            overlap_end = min(end, existing_end)
            overlap_duration = max(0, overlap_end - overlap_start)
            
            segment_overlap_pct = overlap_duration / segment["duration"]
            existing_overlap_pct = overlap_duration / existing["duration"]
            
            if segment_overlap_pct > 0.5 or existing_overlap_pct > 0.5:
                overlaps_existing = True
                break
        
        if not overlaps_existing:
            final_segments.append(segment)
    
    # Sort final segments by start time
    final_segments.sort(key=lambda x: x["startTime"])
    
    return final_segments

def get_segment_score_breakdown(segment: Dict[str, Any], chunk: Any) -> Dict[str, float]:
    """Get detailed score breakdown for a segment"""
    return {
        "base_type_score": 0.3 if segment.get("type", "").startswith("speech") else 0.2,
        "intensity_bonus": segment.get("source_intensity", 0) * 0.1,
        "excitement_bonus": segment.get("source_excitement", 0) * 0.15,
        "fusion_bonus": segment.get("fusion_score", 0) * 0.3 if segment.get("type") == "multi_modal_fusion" else 0,
        "duration_penalty": max(0, 1 - abs(segment.get("duration", 20) - 20) / 20) * 0.1,
        "context_bonus": 0.05  # Placeholder - would be calculated based on overlaps
    }

def get_segment_reasons(segment: Dict[str, Any], chunk: Any) -> List[str]:
    """Get human-readable reasons why this segment was selected"""
    reasons = []
    
    segment_type = segment.get("type", "")
    if segment_type.startswith("speech"):
        reasons.append("Contains high-intensity speech")
        if segment.get("source_excitement", 0) > 0:
            reasons.append("Excitement keywords detected")
    elif segment_type.startswith("audio"):
        reasons.append(f"Audio {segment.get('type', '').split('_')[-1]} detected")
    elif segment_type.startswith("vision"):
        reasons.append(f"Visual event: {segment.get('type', '').split('_')[-1]}")
    elif segment_type == "multi_modal_fusion":
        types = segment.get("source_types", [])
        reasons.append(f"Multiple events detected: {', '.join(types)}")
    
    if segment.get("source_intensity", 0) > 0.7:
        reasons.append("High intensity detected")
    
    duration = segment.get("duration", 0)
    if 15 <= duration <= 30:
        reasons.append("Optimal highlight duration")
    
    return reasons