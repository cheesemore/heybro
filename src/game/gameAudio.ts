import type { FederatedPointerEvent } from 'pixi.js';
import { getSkillById } from './skillsCatalog';

/** 界面 BGM 轨道 id（资源就绪后映射到 public 音频） */
export type ScreenMusicTrack = 'title' | 'chapterSelect' | 'battle';

let activeScreenMusic: ScreenMusicTrack | null = null;

/**
 * 切换界面背景音乐。同一轨道重复调用不重复起播。
 * 暂无音乐：资源 id 与 Web Audio / HTMLAudio 播放逻辑待接入。
 */
export function startScreenMusic(track: ScreenMusicTrack): void {
  if (activeScreenMusic === track) return;
  activeScreenMusic = track;
  // 暂无音乐 — 例：void playBgm(`bgm/${track}.ogg`, { loop: true });
  void track;
}

/** 离开界面时停止 BGM。暂无音乐。 */
export function stopScreenMusic(): void {
  if (activeScreenMusic == null) return;
  activeScreenMusic = null;
  // 暂无音乐 — 例：stopBgm();
}

/** 通用 UI 按钮点击。暂无音效。 */
export function playButtonClickSfx(): void {
  // 暂无音效 — 例：playSfx('ui/button_click.ogg');
}

type PointerTapTarget = {
  on(event: 'pointertap', fn: (e: FederatedPointerEvent) => void): unknown;
};

/** 可点击控件：先播按钮音效（暂无音效），再执行回调。 */
export function bindGamePointerTap(
  target: PointerTapTarget,
  handler: (e: FederatedPointerEvent) => void,
): void {
  target.on('pointertap', (e: FederatedPointerEvent) => {
    playButtonClickSfx();
    handler(e);
  });
}

function skillLaunchAssetId(skillId: string): string {
  return getSkillById(skillId)?.launchSfx?.trim() ?? '';
}

function skillHitAssetId(skillId: string): string {
  return getSkillById(skillId)?.hitSfx?.trim() ?? '';
}

/**
 * 技能发射瞬间（如暗影箭离手）。读 `skills.json` 的 `launchSfx`；空串不播。
 * 暂无音效。
 */
export function playSkillLaunchSfx(skillId: string): void {
  const assetId = skillLaunchAssetId(skillId);
  if (!assetId) return;
  // 暂无音效 — 例：playSfx(`skills/${assetId}.ogg`);
  void assetId;
}

/**
 * 技能命中瞬间（如暗影箭法球击中）。读 `skills.json` 的 `hitSfx`；空串不播。
 * 暂无音效。
 */
export function playSkillHitSfx(skillId: string): void {
  const assetId = skillHitAssetId(skillId);
  if (!assetId) return;
  // 暂无音效 — 例：playSfx(`skills/${assetId}.ogg`);
  void assetId;
}
