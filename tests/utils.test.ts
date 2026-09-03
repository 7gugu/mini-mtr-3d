import { getPathLength, getInterpolatedPoint } from '../src/utils';

describe('utils', () => {
    describe('getPathLength', () => {
        it('should calculate length of straight line', () => {
            const path = [{x:0, y:0}, {x:10, y:0}];
            expect(getPathLength(path)).toBe(10);
        });

        it('should calculate length of multi-segment line', () => {
            const path = [{x:0, y:0}, {x:10, y:0}, {x:10, y:10}];
            expect(getPathLength(path)).toBe(20);
        });

        it('should return 0 for single point', () => {
            const path = [{x:0, y:0}];
            expect(getPathLength(path)).toBe(0);
        });
    });

    describe('getInterpolatedPoint', () => {
        const path = [{x:0, y:0}, {x:100, y:0}, {x:100, y:100}];
        
        it('should return null for empty path', () => {
            expect(getInterpolatedPoint([], 0.5)).toBeNull();
        });

        it('should return start point at t=0', () => {
            const p = getInterpolatedPoint(path, 0);
            expect(p).toMatchObject({x: 0, y: 0});
        });

        it('should return end point at t=1', () => {
            const p = getInterpolatedPoint(path, 1);
            expect(p).toMatchObject({x: 100, y: 100});
        });

        it('should interpolate correctly at midpoint (t=0.5)', () => {
            // Total length = 200. Midpoint is at length 100, which is {100, 0}
            const p = getInterpolatedPoint(path, 0.5);
            expect(p).toMatchObject({x: 100, y: 0});
            // Angle should be 0 (along first segment) or PI/2 (start of second)? 
            // Implementation logic:
            // currentLen + segLen >= targetLen.
            // i=0: segLen=100. targetLen=100.
            // 0 + 100 >= 100. True.
            // segT = (100 - 0)/100 = 1.
            // x = 0 + 100*1 = 100. y = 0.
            // angle = atan2(0, 100) = 0.
            expect(p?.angle).toBe(0);
        });

        it('should interpolate correctly at t=0.75', () => {
            // Total length 200. Target 150.
            // Segment 1 ends at 100.
            // Segment 2: start {100,0}, end {100,100}, length 100.
            // target in seg2 = 150 - 100 = 50.
            // segT = 50/100 = 0.5.
            // x = 100 + 0 = 100.
            // y = 0 + 100*0.5 = 50.
            const p = getInterpolatedPoint(path, 0.75);
            expect(p).toMatchObject({x: 100, y: 50});
            expect(p?.angle).toBeCloseTo(Math.PI / 2);
        });
    });
});

