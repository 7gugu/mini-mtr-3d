import * as THREE from 'three';

export interface Point {
    x: number;
    y: number;
    z?: number;
}

export interface Point3D extends Point {
    z?: number;
}

export interface InterpolatedPoint extends Point {
    angle: number;
}

export function getPathLength(path: Point[]): number {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const dx = path[i+1].x - path[i].x;
        const dy = path[i+1].y - path[i].y;
        total += Math.sqrt(dx*dx + dy*dy);
    }
    return total;
}

export function getInterpolatedPoint(path: Point[], t: number): InterpolatedPoint | null {
    if (!path || path.length < 2) return null;
    
    if (path.length === 2) {
        const p1 = path[0];
        const p2 = path[1];
        const x = p1.x + (p2.x - p1.x) * t;
        const y = p1.y + (p2.y - p1.y) * t;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        return { x, y, angle };
    }

    const totalLen = getPathLength(path);
    const targetLen = totalLen * t;
    
    let currentLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segLen = Math.sqrt(dx*dx + dy*dy);
        
        if (currentLen + segLen >= targetLen) {
            const segT = (targetLen - currentLen) / segLen;
            const x = p1.x + dx * segT;
            const y = p1.y + dy * segT;
            const angle = Math.atan2(dy, dx);
            return { x, y, angle };
        }
        currentLen += segLen;
    }
    
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
}

/**
 * Smooths a path of 2D/3D coordinates using Catmull-Rom Spline.
 * @param points Array of coordinates [x, y, z?]
 * @param segments Number of interpolated points per segment
 * @param closed Whether the path is a closed loop
 * @returns Smoothed array of coordinates
 */
export function getSmoothedPath(points: number[][], segments: number = 10, closed: boolean = false): number[][] {
    if (points.length < 2) return points;

    const vec3Points = points.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0));
    const curve = new THREE.CatmullRomCurve3(vec3Points, closed, 'catmullrom', 0.5); // tension 0.5
    
    // Determine total points: original segments * subdivision
    const totalPoints = (points.length - 1) * segments;
    const smoothedPoints = curve.getPoints(totalPoints);

    return smoothedPoints.map(v => [v.x, v.y, v.z]);
}

export function createBoxMesh(AMap: any, width: number, length: number, height: number, color: number[]): any {
    const mesh = new AMap.Object3D.Mesh();
    const geometry = mesh.geometry;
    
    const halfW = width / 2;
    const halfL = length / 2;
    const h = height;

    const vertices = [
        -halfW, -halfL, 0,
        halfW, -halfL, 0,
        halfW, halfL, 0,
        -halfW, halfL, 0,
        -halfW, -halfL, h,
        halfW, -halfL, h,
        halfW, halfL, h,
        -halfW, halfL, h
    ];
    
    const faces = [
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7
    ];

    for (let v of vertices) {
        geometry.vertices.push(v);
    }
    
    for (let f of faces) {
        geometry.faces.push(f);
    }
    
    for (let i = 0; i < geometry.vertices.length / 3; i++) {
        geometry.vertexColors.push(...color);
    }
    
    mesh.transparent = true;
    mesh.backOrFront = 'both';
    
    return mesh;
}
