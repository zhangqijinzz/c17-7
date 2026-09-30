import { describe, expect, it } from 'vitest';
import { createStarterStory, type StoryDocument } from '../models/story';
import { annotationsForScene, createAnnotation, isOrphan, openAnnotations, orphanAnnotations } from '../models/annotations';
import { getStats, getTimelineWarning, orderedScenes, sanitizeStory, validateName } from '../models/storyRules';

describe('story domain rules', () => {
  it('sorts scenes and calculates unresolved clues', () => {
    const story = createStarterStory();
    story.scenes = [...story.scenes].reverse();
    expect(orderedScenes(story).map((scene) => scene.title)).toEqual(['旧港口的来信', '风暴前夜']);
    expect(getStats(story)).toMatchObject({ characters: 2, scenes: 2, clues: 1, unresolvedClues: 1, openAnnotations: 1, completion: 80 });
  });

  it('guards invalid names and duplicate timeline orders', () => {
    const story = createStarterStory();
    story.scenes[1].order = story.scenes[0].order;
    expect(validateName(' ')).toBe('至少输入 2 个字');
    expect(getTimelineWarning(story)).toContain('重复');
  });

  it('rejects corrupt persisted documents', () => {
    expect(sanitizeStory('{bad json}')).toBeNull();
    expect(sanitizeStory({ version: 99 })).toBeNull();
    expect(sanitizeStory(createStarterStory())).not.toBeNull();
  });
});

describe('annotation migration and attachment rules', () => {
  it('migrates old projects without annotations to an empty todo list instead of failing', () => {
    const legacy = createStarterStory() as Partial<StoryDocument>;
    delete legacy.annotations;
    const migrated = sanitizeStory(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.annotations).toEqual([]);
    expect(getStats(migrated as StoryDocument).openAnnotations).toBe(0);
  });

  it('keeps annotations as orphans when their scene is missing from the document', () => {
    const story = createStarterStory();
    story.scenes = story.scenes.filter((scene) => scene.id !== 'scene-old-harbor');
    const migrated = sanitizeStory(story) as StoryDocument;
    expect(migrated.annotations.length).toBeGreaterThan(0);
    const harborThread = migrated.annotations.find((thread) => thread.sceneId === 'scene-old-harbor');
    expect(harborThread).toBeDefined();
    expect(isOrphan(harborThread!, migrated)).toBe(true);
    expect(orphanAnnotations(migrated).map((thread) => thread.id)).toContain(harborThread!.id);
    expect(openAnnotations(migrated).map((thread) => thread.id)).toContain(harborThread!.id);
  });

  it('drops malformed annotation payloads but keeps the rest of the story', () => {
    const story = createStarterStory();
    const corrupted = JSON.parse(JSON.stringify(story));
    corrupted.annotations.push({ id: 'bad', sceneId: 'x', resolved: false, messages: [] });
    const migrated = sanitizeStory(corrupted) as StoryDocument;
    expect(migrated.annotations.find((thread) => thread.id === 'bad')).toBeUndefined();
    expect(migrated.scenes.length).toBe(story.scenes.length);
  });

  it('attaches new threads to a scene by stable id', () => {
    const story = createStarterStory();
    const thread = createAnnotation('scene-storm', '风暴前夜', 'editor', '这里节奏可以再快一点。');
    story.annotations.push(thread);
    expect(annotationsForScene(story, 'scene-storm').map((item) => item.id)).toContain(thread.id);
    expect(openAnnotations(story).length).toBe(2);
  });
});
