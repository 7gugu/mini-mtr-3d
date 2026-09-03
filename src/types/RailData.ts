// src/types/RailData.ts

/**
 * Coordinate tuple [lng, lat]
 */
export type LngLat = [number, number];

export interface TrackPoint {
    location: LngLat;
    name?: string; // User defined name for the point (e.g. "Station A")
}

/**
 * Represents a physical track path (geometry) in the real world.
 * This decouples geometry from the schedule.
 */
export interface TrackGeometry {
    id: string;
    // The sequence of coordinates forming the track
    path: TrackPoint[]; 
    // Optional: Pre-calculated length in meters (useful for uniform speed calculation)
    length?: number;
    // Optional: Control points for Bezier curves if generated procedurally
    controlPoints?: LngLat[]; 
    
    // Appearance
    color?: string; // Hex color string e.g. "#ff0000"
}

/**
 * Represents a single leg of a train's journey (e.g., from Station A to Station B).
 */
export interface TripLeg {
    // Reference to the physical track geometry ID
    trackId: string;
    
    // Station IDs
    fromStationId: string;
    toStationId: string;

    // Timing (Unix Timestamps in ms)
    departureTime: number;
    arrivalTime: number;

    // Direction (1 for forward along track path, -1 for backward)
    direction?: number;
}

/**
 * Represents a full train trip consisting of multiple legs.
 */
export interface TrainTrip {
    trainId: string; // e.g., "G1001"
    legs: TripLeg[];
    // --- MTR 实时可视化扩展 ---
    lineId?: string;              // 所属线路 (e.g. "TWL")，用于配色/告警/实时匹配
    direction?: 'UP' | 'DOWN';    // data.gov.hk 方向定义
}

/**
 * The complete dataset container.
 */
export interface RailSystemData {
    tracks: Record<string, TrackGeometry>; // Map trackId -> Geometry
    trips: TrainTrip[];
}
