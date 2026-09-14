/** レベルの色テーマ(背景色・台の色・飾り)。 */
import type { ThemeId } from '../app/state';

export interface Theme {
  bg: string;       // 一色の背景
  board: string;    // 台の上面
  boardSide: string;
  lawn: string;     // 汽車ループの内側
  tree: string;
  trunk: string;
  house: string;
  roof: string;
  snow: boolean;
  palm: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: { bg: '#f6b7c9', board: '#c98a4b', boardSide: '#8b5a2b', lawn: '#9fd07a', tree: '#5aae4e', trunk: '#8b5a2b', house: '#f2d3a0', roof: '#d94f4f', snow: false, palm: false },
  beach:  { bg: '#8fd0f0', board: '#e0b883', boardSide: '#a9835a', lawn: '#f4d98f', tree: '#4fb37a', trunk: '#b08a5c', house: '#fff3d6', roof: '#4f8fd9', snow: false, palm: true },
  snow:   { bg: '#5b4a7a', board: '#a08cc0', boardSide: '#6f5a94', lawn: '#f6f9ff', tree: '#3f8a63', trunk: '#6b4b2b', house: '#f2d3a0', roof: '#4f6fa8', snow: true, palm: false },
  sunset: { bg: '#f6c05a', board: '#c98a4b', boardSide: '#8b5a2b', lawn: '#e8a15a', tree: '#3f6a4a', trunk: '#5c3a1a', house: '#f7e3b8', roof: '#8a3d8f', snow: false, palm: false },
};
