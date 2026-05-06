/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When true, load all public/assets/enemies/<EnemyPaintKind>.png that exist */
  readonly VITE_ENEMY_TEXTURES?: string;
  /** Legacy: when true and VITE_ENEMY_TEXTURES is unset/false, only preload grunt.png */
  readonly VITE_ENEMY_GRUNT_TEXTURE?: string;
}
