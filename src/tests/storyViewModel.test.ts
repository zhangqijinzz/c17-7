import { describe, expect, it } from 'vitest';
import { createStarterStory } from '../models/story';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { MemoryStorageService } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

describe('story view model', () => {
  it('initializes, edits, persists, and restores the main flow', () => {
    const repository = new LocalStoryRepository(new MemoryStorageService());
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    expect(viewModel.snapshot.status).toBe('ready');
    viewModel.addCharacter('阿洛', '修复师');
    viewModel.addScene('地下档案室', '他们找到被隐藏的航海日志。');
    const scene = viewModel.selectedScene;
    expect(scene?.title).toBe('地下档案室');
    viewModel.toggleCharacter(scene?.id ?? '', viewModel.snapshot.story?.characters[2]?.id ?? '');
    expect(viewModel.snapshot.stats.characters).toBe(3);

    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.snapshot.story?.scenes.some((item) => item.title === '地下档案室')).toBe(true);
    expect(restored.snapshot.story?.characters.some((item) => item.name === '阿洛')).toBe(true);
  });

  it('shows recoverable validation feedback and resets corrupt storage', () => {
    const storage = new MemoryStorageService();
    storage.write('{broken');
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    viewModel.addCharacter(' ', '');
    expect(viewModel.snapshot.notice).toContain('至少');
    viewModel.resetProject();
    expect(viewModel.snapshot.story?.id).toBe(createStarterStory().id);
  });

  it('opens old projects with an empty annotation todo list', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory();
    delete (legacy as { annotations?: unknown }).annotations;
    storage.write(JSON.stringify(legacy));
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.snapshot.status).not.toBe('error');
    expect(viewModel.snapshot.stats.openAnnotations).toBe(0);
    expect(viewModel.openAnnotationThreads).toEqual([]);
    expect(viewModel.orphanAnnotationThreads).toEqual([]);
  });
});

describe('annotation threads', () => {
  function setup(): StoryViewModel {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    return viewModel;
  }

  it('creates threads, replies, resolves and reopens them', () => {
    const viewModel = setup();
    const sceneId = viewModel.selectedScene!.id;
    viewModel.addAnnotation(sceneId, '这一幕的情绪转折太突然。', 'editor');
    expect(viewModel.openAnnotationThreads.length).toBe(2);
    const thread = viewModel.annotationsOnScene(sceneId)[0];

    viewModel.replyToAnnotation(thread.id, '我补一个米拉沉默的镜头。', 'author');
    expect(viewModel.annotationsOnScene(sceneId)[0].messages.length).toBe(2);

    viewModel.resolveAnnotation(thread.id);
    expect(viewModel.openAnnotationThreads.some((item) => item.id === thread.id)).toBe(false);
    // 解决后不能再往线程里回复，避免讨论悄悄挂在关闭的线程上
    viewModel.replyToAnnotation(thread.id, '再补一句', 'editor');
    expect(viewModel.annotationsOnScene(sceneId).find((item) => item.id === thread.id)?.messages.length).toBe(2);

    viewModel.reopenAnnotation(thread.id);
    expect(viewModel.openAnnotationThreads.some((item) => item.id === thread.id)).toBe(true);
  });

  it('keeps threads attached through reordering, renaming and persistence', () => {
    const repository = new LocalStoryRepository(new MemoryStorageService());
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    const sceneId = viewModel.snapshot.story!.scenes.find((scene) => scene.title === '风暴前夜')!.id;
    viewModel.addAnnotation(sceneId, '罗盘需要一个特写。', 'editor');
    const threadId = viewModel.annotationsOnScene(sceneId)[0].id;

    viewModel.selectScene(sceneId);
    viewModel.moveScene(sceneId, 'up');
    viewModel.updateScene(sceneId, { title: '暴风雨之夜' });
    const story = viewModel.snapshot.story!;
    const thread = story.annotations.find((item) => item.id === threadId)!;
    expect(thread.sceneId).toBe(sceneId);
    expect(thread.sceneTitle).toBe('暴风雨之夜');

    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.annotationsOnScene(sceneId).map((item) => item.id)).toContain(threadId);
  });

  it('never deletes annotations when a scene is removed; they become orphans in the todo', () => {
    const viewModel = setup();
    const sceneId = viewModel.snapshot.story!.scenes.find((scene) => scene.title === '风暴前夜')!.id;
    viewModel.addAnnotation(sceneId, '删场景也要留住的批注。', 'editor');
    const threadId = viewModel.annotationsOnScene(sceneId)[0].id;

    viewModel.deleteScene(sceneId);
    // 批注原样保留、仍按 sceneId 绑定，只是变成无法跳转的孤儿线程
    expect(viewModel.snapshot.story!.annotations.map((item) => item.id)).toContain(threadId);
    expect(viewModel.orphanAnnotationThreads.map((item) => item.id)).toContain(threadId);
    expect(viewModel.openAnnotationThreads.map((item) => item.id)).toContain(threadId);
    expect(viewModel.focusAnnotation(threadId)).toBe(false);
  });

  it('warns about open annotations on completion without blocking it', () => {
    const viewModel = setup();
    expect(viewModel.snapshot.story!.status).toBe('draft');
    viewModel.completeProject();
    expect(viewModel.snapshot.story!.status).toBe('complete');
    expect(viewModel.snapshot.notice).toContain('1 条批注未解决');
    expect(viewModel.snapshot.stats.openAnnotations).toBe(1);

    const clean = setup();
    clean.annotationsOnScene(clean.snapshot.story!.selectedSceneId).forEach((thread) => clean.resolveAnnotation(thread.id));
    clean.completeProject();
    expect(clean.snapshot.notice).not.toContain('未解决');
  });

  it('jumps from a todo item to its scene', () => {
    const viewModel = setup();
    const stormId = viewModel.snapshot.story!.scenes.find((scene) => scene.title === '风暴前夜')!.id;
    viewModel.addAnnotation(stormId, '待办跳转目标。', 'editor');
    const threadId = viewModel.annotationsOnScene(stormId)[0].id;
    expect(viewModel.focusAnnotation(threadId)).toBe(true);
    expect(viewModel.selectedScene?.id).toBe(stormId);
  });
});
