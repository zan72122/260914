/** レベルの色テーマと飾り。 */
import type { ThemeId } from '../app/state';

export interface Theme {
  paper: string;   // 地面(ループの外)
  lawn: string;    // ループの内側
  bed: string;     // 線路の砂利
  rail: string;
  tie: string;
  tree: string;
  trunk: string;
  house: string;
  roof: string;
  sky: string;     // 雲や太陽の色
  hasSun: boolean;
  snow: boolean;
  palm: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: {
    paper: '#f3e7c9', lawn: '#9fd07a', bed: '#d9c39a', rail: '#8c6b45', tie: '#a9835a',
    tree: '#5aae4e', trunk: '#8b5a2b', house: '#f2d3a0', roof: '#d94f4f', sky: '#ffffff',
    hasSun: false, snow: false, palm: false,
  },
  beach: {
    paper: '#f7e6b8', lawn: '#f4d98f', bed: '#e5cfa3', rail: '#8c6b45', tie: '#b08a5c',
    tree: '#4fb37a', trunk: '#b08a5c', house: '#fff3d6', roof: '#4f8fd9', sky: '#ffffff',
    hasSun: true, snow: false, palm: true,
  },
  snow: {
    paper: '#e3ecf5', lawn: '#f6f9ff', bed: '#c9d3de', rail: '#6d7c8c', tie: '#8fa0b3',
    tree: '#3f8a63', trunk: '#6b4b2b', house: '#f2d3a0', roof: '#4f6fa8', sky: '#ffffff',
    hasSun: false, snow: true, palm: false,
  },
  sunset: {
    paper: '#f4c48a', lawn: '#e8a15a', bed: '#c9915a', rail: '#6b4020', tie: '#8a5a30',
    tree: '#3f6a4a', trunk: '#5c3a1a', house: '#f7e3b8', roof: '#8a3d8f', sky: '#ffd27a',
    hasSun: true, snow: false, palm: false,
  },
};
