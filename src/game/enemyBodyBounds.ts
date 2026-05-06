import type { EnemyPaintKind } from './battleVisuals';

/**
 * Local-space width × height (before body.scale) matching paintEnemyBody geometry in battleVisuals.ts.
 */
export const ENEMY_BODY_BOUNDS: Record<EnemyPaintKind, { w: number; h: number }> = {
  grunt: { w: 52, h: 60 },
  wolf: { w: 52, h: 62 },
  headhunter: { w: 50, h: 76 },
  darkspear: { w: 48, h: 68 },
  dread_warrior: { w: 74, h: 64 },
  raider: { w: 54, h: 54 },
  beserker: { w: 58, h: 52 },
  kodo: { w: 66, h: 68 },
  ultralisk: { w: 58, h: 76 },
  abomination: { w: 66, h: 64 },
  shaman: { w: 36, h: 84 },
  batrider: { w: 50, h: 56 },
  catapult: { w: 68, h: 54 },
  mirror: { w: 46, h: 52 },
  boss_farseer: { w: 54, h: 76 },
  boss_tauren: { w: 54, h: 70 },
  boss_blademaster: { w: 76, h: 58 },
};

/** Preload order when textures are enabled */
export const ENEMY_PAINT_PRELOAD_ORDER: readonly EnemyPaintKind[] = [
  'grunt',
  'wolf',
  'dread_warrior',
  'raider',
  'beserker',
  'kodo',
  'ultralisk',
  'abomination',
  'headhunter',
  'darkspear',
  'shaman',
  'batrider',
  'catapult',
  'mirror',
  'boss_farseer',
  'boss_tauren',
  'boss_blademaster',
];
