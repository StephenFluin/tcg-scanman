declare module 'js-aruco2' {
  export interface Corner {
    x: number;
    y: number;
  }

  export interface Marker {
    id: number;
    corners: Corner[];
  }

  export interface DetectorOptions {
    dictionaryName?: string;
  }

  export class Detector {
    constructor(options?: DetectorOptions);
    detect(imageData: ImageData): Marker[];
  }

  export const AR: {
    Detector: typeof Detector;
    DICTIONARIES: {
      ARUCO: string;
      ARUCO_MIP_36h12: string;
      [key: string]: string;
    };
  };
}
