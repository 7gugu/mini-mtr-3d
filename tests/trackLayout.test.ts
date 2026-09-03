import {
    offsetOverlappingPolylines,
    clusterStations,
    TRACK_LANE_SPACING,
    interchangeCapsuleSize,
} from '../src/trackLayout';

function horizontal(n: number, y: number): number[][] {
    return Array.from({ length: n }, (_, i) => [i * 20, y]);
}

function vertical(n: number, x: number): number[][] {
    return Array.from({ length: n }, (_, i) => [x, i * 20]);
}

describe('offsetOverlappingPolylines', () => {
    it('spreads two coincident parallel polylines onto opposite lanes', () => {
        const line = horizontal(12, 0);
        const out = offsetOverlappingPolylines({
            track_A: line.map(p => [...p]),
            track_B: line.map(p => [...p]),
        });
        const mid = 6;
        const dy = out.track_B[mid][1] - out.track_A[mid][1];
        expect(Math.abs(dy)).toBeCloseTo(TRACK_LANE_SPACING, 5);
        expect(out.track_A[mid][1]).toBeCloseTo(-TRACK_LANE_SPACING / 2, 5);
        expect(out.track_B[mid][1]).toBeCloseTo(TRACK_LANE_SPACING / 2, 5);
        expect(out.track_A.length).toBe(12);
    });

    it('does not offset a perpendicular crossing', () => {
        const h = horizontal(10, 100);
        const v = vertical(10, 100);
        const out = offsetOverlappingPolylines({ track_H: h, track_V: v });
        for (let i = 0; i < h.length; i++) {
            expect(out.track_H[i][0]).toBeCloseTo(h[i][0], 5);
            expect(out.track_H[i][1]).toBeCloseTo(h[i][1], 5);
        }
        for (let i = 0; i < v.length; i++) {
            expect(out.track_V[i][0]).toBeCloseTo(v[i][0], 5);
            expect(out.track_V[i][1]).toBeCloseTo(v[i][1], 5);
        }
    });

    it('leaves a lonely track unmoved', () => {
        const line = horizontal(5, 3);
        const out = offsetOverlappingPolylines({ track_ONLY: line });
        expect(out.track_ONLY).toEqual(line);
    });

    it('keeps East Rail main and LMC branch on one ribbon', () => {
        const line = horizontal(12, 0);
        const out = offsetOverlappingPolylines({
            track_EAL: line.map(p => [...p]),
            track_EAL_LMC: line.map(p => [...p]),
        });
        expect(out.track_EAL).toEqual(line);
        expect(out.track_EAL_LMC).toEqual(line);
    });

    it('keeps Tseung Kwan O main and LOHAS branch on one ribbon', () => {
        const line = horizontal(12, 0);
        const out = offsetOverlappingPolylines({
            track_TKL: line.map(p => [...p]),
            track_TKL_LHP: line.map(p => [...p]),
        });
        expect(out.track_TKL).toEqual(line);
        expect(out.track_TKL_LHP).toEqual(line);
    });
});

describe('clusterStations', () => {
    it('groups the same station code from multiple lines as interchange', () => {
        const tracks = {
            track_AEL: {
                path: [
                    { location: [114.16, 22.28] as [number, number], name: 'AEL_HOK' },
                ],
            },
            track_TCL: {
                path: [
                    { location: [114.16, 22.28] as [number, number], name: 'TCL_HOK' },
                ],
            },
        };
        const coords = {
            track_AEL: [[0, -20]],
            track_TCL: [[0, 20]],
        };
        const clusters = clusterStations(tracks, coords);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].code).toBe('HOK');
        expect(clusters[0].isInterchange).toBe(true);
        expect(clusters[0].spanAlong).toBeGreaterThan(30);
        const size = interchangeCapsuleSize(clusters[0]);
        expect(size.length).toBeGreaterThan(size.width);
    });
});
