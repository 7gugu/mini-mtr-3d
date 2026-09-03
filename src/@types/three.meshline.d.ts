// src/types/declarations.d.ts
declare module 'three.meshline' {
    import { BufferGeometry, Material, ShaderMaterial, Color, Vector2 } from 'three';

    export class MeshLine extends BufferGeometry {
        constructor();
        setPoints(points: number[] | Float32Array, wcb?: (p: number) => number): void;
    }

    export class MeshLineMaterial extends ShaderMaterial {
        constructor(parameters?: any);
        color: Color;
        opacity: number;
        lineWidth: number;
        sizeAttenuation: number;
        resolution: Vector2;
        near: number;
        far: number;
        dashArray: number;
        dashOffset: number;
        dashRatio: number;
        useMap: number;
        map: any;
        alphaMap: any;
        repeat: Vector2;
    }
}
