import { describe, expect, it } from 'vitest';
import { createStarterStory, type StoryDocument } from '../models/story';
import { getStats, isOrphanThread, normalizeStory, orderedScenes, threadsForScene, unresolvedThreads } from '../models/storyRules';

function oldProjectWithoutComments(): StoryDocument {
  const story = createStarterStory() as Partial<StoryDocument>;
  delete story.comments;
  return story as unknown as StoryDocument;
}

describe('comment domain rules', () => {
  it('migrates legacy projects: missing comments become an empty todo list instead of an error', () => {
    const migrated = normalizeStory(oldProjectWithoutComments());
    expect(migrated).not.toBeNull();
    expect(migrated?.comments).toEqual([]);
    if (migrated) {
      expect(getStats(migrated).unresolvedComments).toBe(0);
      expect(unresolvedThreads(migrated)).toEqual([]);
    }
  });

  it('anchors threads to stable scene ids so reordering and renaming never misplace them', () => {
    const story = createStarterStory();
    const [first, second] = orderedScenes(story);
    story.scenes = [
      { ...first, order: 2, title: '旧港口的来信（改名了）' },
      { ...second, order: 1 },
    ];
    const thread = story.comments[0];
    expect(threadsForScene(story, first.id)).toHaveLength(1);
    expect(threadsForScene(story, first.id)[0].id).toBe(thread.id);
    // 待办仍指向原场景，顺序号与改名完全不影响归属。
    expect(unresolvedThreads(story)[0].sceneId).toBe(first.id);
  });

  it('keeps threads archived (never dropped or reattached) when the scene is deleted', () => {
    const story = createStarterStory();
    const deletedScene = story.scenes[0];
    story.scenes = story.scenes.filter((scene) => scene.id !== deletedScene.id);
    const migrated = normalizeStory(story);
    expect(migrated).not.toBeNull();
    const thread = migrated!.comments[0];
    expect(thread.sceneId).toBe(deletedScene.id);
    expect(thread.sceneTitle).toBe('旧港口的来信');
    expect(isOrphanThread(migrated!, thread)).toBe(true);
    // 未解决的归档批注仍然出现在待办里，不凭空消失。
    expect(unresolvedThreads(migrated!).map((item) => item.id)).toContain(thread.id);
  });

  it('drops malformed thread payloads while keeping the rest of the document readable', () => {
    const story = createStarterStory();
    const broken = { ...story, comments: [{ id: 'bad' }, ...story.comments] };
    const migrated = normalizeStory(broken);
    expect(migrated?.comments).toHaveLength(1);
  });
});
