// src/config.ts
declare const process: {
  env: {
    [key: string]: string | undefined;
  };
};

export const config = {
  AMAP_KEY: process.env.AMAP_KEY || '',
  AMAP_SECURITY_CODE: process.env.AMAP_SECURITY_CODE || '',
};

