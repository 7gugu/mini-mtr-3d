// Minimal Type Definitions for AMap to satisfy TS
declare namespace AMap {
    class Map {
        constructor(div: string | HTMLElement, opts: any);
        add(obj: any): void;
        remove(obj: any): void; // Missing remove
        setCenter(center: any, immediate?: boolean): void;
        lngLatToGeodeticCoord(lnglat: any): { x: number, y: number };
        geodeticCoordToLngLat(pixel: Pixel): any;
        plugin(name: string | string[], callback: () => void): void; // string[] support
        customCoords: any; 
        render(): void;
    }
    class Pixel {
        constructor(x: number, y: number);
        x: number;
        y: number;
    }
    class LngLat {
        constructor(lng: number, lat: number);
        offset(w: number, s: number): LngLat;
        distance(lnglat: LngLat): number;
        getLng(): number;
        getLat(): number;
    }
    
    class GLCustomLayer {
        constructor(opts: any);
        setzIndex(z: number): void;
    }

    class Polyline {
        constructor(opts: any);
        getPath(): any[];
    }
    
    class PolylineEditor {
        constructor(map: Map, polyline: Polyline);
        open(): void;
        close(): void;
    }
}

declare const AMapLoader: {
    load(config: any): Promise<any>;
};

declare module "*.css";
