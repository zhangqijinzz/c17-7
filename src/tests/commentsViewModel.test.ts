import { describe, expect, it } from 'vitest';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { MemoryStorageService } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

function createViewModel() {
  return new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
}

describe('comment threads in the view model', () => {
  it('adds threads, replies, resolves and reopens them', () => {
    const viewModel = createViewModel();
    viewModel.initialize();
    const sceneId = viewModel.snapshot.story!.scenes[0].id;

    viewModel.addComment(sceneId, '编辑', '这一幕的动机可以再明确一点');
    expect(viewModel.snapshot.stats.unresolvedComments).toBe(2);

    const newThread = viewModel.threadsOf(sceneId).find((thread) => thread.comments[0].body === '这一幕的动机可以再明确一点')!;
    expect(newThread).toBeTruthy();
    viewModel.replyToThread(newThread.id, '作者', '收到，下一稿补上');
    expect(viewModel.threadsOf(sceneId).find((thread) => thread.id === newThread.id)?.comments).toHaveLength(2);

    viewModel.resolveThread(newThread.id);
    expect(viewModel.snapshot.stats.unresolvedComments).toBe(1);
    expect(viewModel.openThreads.some((thread) => thread.id === newThread.id)).toBe(false);

    viewModel.reopenThread(newThread.id);
    expect(viewModel.snapshot.stats.unresolvedComments).toBe(2);
    expect(viewModel.openThreads.some((thread) => thread.id === newThread.id)).toBe(true);
  });

  it('rejects empty comments', () => {
    const viewModel = createViewModel();
    viewModel.initialize();
    const before = viewModel.snapshot.stats.unresolvedComments;
    viewModel.addComment(viewModel.snapshot.story!.scenes[0].id, '编辑', '   ');
    expect(viewModel.snapshot.stats.unresolvedComments).toBe(before);
    expect(viewModel.snapshot.notice).toContain('不能为空');
  });

  it('jumps from a todo item to its scene and clears the search filter', () => {
    const viewModel = createViewModel();
    viewModel.initialize();
    const targetScene = viewModel.snapshot.story!.scenes[1];
    viewModel.selectScene(viewModel.snapshot.story!.scenes[0].id);
    viewModel.setSearch('不会匹配任何场景的关键字xyz');
    const thread = viewModel.openThreads.find((item) => item.sceneId === targetScene.id);
    expect(thread).toBeUndefined(); // 第二幕没有批注
    const firstThread = viewModel.openThreads[0];
    viewModel.focusThread(firstThread.id);
    expect(viewModel.snapshot.story!.selectedSceneId).toBe(firstThread.sceneId);
    expect(viewModel.snapshot.search).toBe('');
  });

  it('archives threads when a scene is deleted instead of losing or reattaching them', () => {
    const viewModel = createViewModel();
    viewModel.initialize();
    const scene = viewModel.snapshot.story!.scenes[0];
    const threadId = viewModel.threadsOf(scene.id)[0].id;

    viewModel.deleteScene(scene.id);
    expect(viewModel.snapshot.story!.scenes.some((item) => item.id === scene.id)).toBe(false);
    const thread = viewModel.snapshot.story!.comments.find((item) => item.id === threadId)!;
    expect(thread.sceneId).toBe(scene.id);
    expect(thread.sceneTitle).toBe(scene.title);
    expect(viewModel.orphanThreads.map((item) => item.id)).toContain(threadId);

    // 归档线程仍可解决，解决后离开待办，数据保留在文档里。
    viewModel.resolveThread(threadId);
    expect(viewModel.openThreads.map((item) => item.id)).not.toContain(threadId);
    expect(viewModel.snapshot.story!.comments.some((item) => item.id === threadId)).toBe(true);
  });

  it('allows finishing the project with open comments and shows a non-blocking reminder', () => {
    const viewModel = createViewModel();
    viewModel.initialize();
    expect(viewModel.snapshot.stats.unresolvedComments).toBeGreaterThan(0);
    viewModel.completeProject();
    expect(viewModel.snapshot.status).toBe('completed');
    expect(viewModel.snapshot.notice).toContain('未解决批注');
    // 完成后依然可以继续处理批注，没有任何拦截。
    viewModel.resolveThread(viewModel.openThreads[0].id);
    expect(viewModel.snapshot.status).toBe('completed');
  });

  it('opens legacy projects without comments with an empty todo list', () => {
    const storage = new MemoryStorageService();
    const legacy = {
      version: 1,
      id: 'old-story',
      title: '老项目',
      status: 'draft',
      characters: [],
      scenes: [{ id: 's1', title: '唯一一幕', order: 1, summary: '', conflict: '', characterIds: [], clueIds: [] }],
      clues: [],
      selectedSceneId: 's1',
      updatedAt: new Date().toISOString(),
    };
    storage.write(JSON.stringify(legacy));
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.snapshot.status).toBe('ready');
    expect(viewModel.snapshot.story?.comments).toEqual([]);
    expect(viewModel.openThreads).toEqual([]);
  });
});
