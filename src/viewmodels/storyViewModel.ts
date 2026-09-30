import {
  characterColors,
  createId,
  createStarterStory,
  type StoryCharacter,
  type StoryClue,
  type StoryCommentThread,
  type StoryDocument,
  type StoryScene,
} from '../models/story';
import { getStats, getTimelineWarning, isOrphanThread, orderedScenes, threadsForScene, unresolvedThreads, validateName } from '../models/storyRules';
import type { StoryRepository } from '../repositories/storyRepository';

export type ViewModelStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface StoryViewState {
  status: ViewModelStatus;
  story: StoryDocument | null;
  stats: ReturnType<typeof getStats>;
  notice: string;
  error: string;
  search: string;
  activeSection: 'overview' | 'characters' | 'clues';
}

type Listener = () => void;

export class StoryViewModel {
  private state: StoryViewState = {
    status: 'loading',
    story: null,
    stats: { characters: 0, scenes: 0, clues: 0, unresolvedClues: 0, unresolvedComments: 0, completion: 0 },
    notice: '',
    error: '',
    search: '',
    activeSection: 'overview',
  };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: StoryRepository) {}

  get snapshot(): StoryViewState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): void {
    try {
      const story = this.repository.load();
      this.setState({ status: story.status === 'complete' ? 'completed' : 'ready', story, stats: getStats(story), error: '' });
    } catch {
      this.setState({ status: 'error', error: '故事读取失败，请重置为示例项目。' });
    }
  }

  setSearch(search: string): void {
    this.setState({ search });
  }

  setSection(activeSection: StoryViewState['activeSection']): void {
    this.setState({ activeSection });
  }

  selectScene(sceneId: string): void {
    this.updateStory((story) => ({ ...story, selectedSceneId: sceneId }));
  }

  addCharacter(name: string, role: string): void {
    const cleanName = validateName(name);
    if (cleanName === '至少输入 2 个字') {
      this.setState({ notice: cleanName });
      return;
    }
    const story = this.requireStory();
    const character: StoryCharacter = {
      id: createId('character'),
      name: cleanName,
      role: role.trim() || '待定义角色',
      color: characterColors[story.characters.length % characterColors.length],
    };
    this.updateStory((current) => ({ ...current, characters: [...current.characters, character] }));
    this.setState({ notice: `已加入人物「${character.name}」` });
  }

  addScene(title: string, summary: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    const story = this.requireStory();
    const scene: StoryScene = {
      id: createId('scene'),
      title: cleanTitle,
      order: story.scenes.length + 1,
      summary: summary.trim() || '还没有写下这一幕发生了什么。',
      conflict: '',
      characterIds: [],
      clueIds: [],
    };
    this.updateStory((current) => ({ ...current, scenes: [...current.scenes, scene], selectedSceneId: scene.id }));
    this.setState({ notice: `已创建场景「${scene.title}」` });
  }

  updateScene(sceneId: string, patch: Partial<Pick<StoryScene, 'title' | 'summary' | 'conflict'>>): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
    }), false);
  }

  toggleCharacter(sceneId: string, characterId: string): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const hasCharacter = scene.characterIds.includes(characterId);
        return { ...scene, characterIds: hasCharacter ? scene.characterIds.filter((id) => id !== characterId) : [...scene.characterIds, characterId] };
      }),
    }));
  }

  moveScene(sceneId: string, direction: 'up' | 'down'): void {
    const scenes = orderedScenes(this.requireStory());
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= scenes.length) return;
    [scenes[index], scenes[nextIndex]] = [scenes[nextIndex], scenes[index]];
    this.updateStory((story) => ({ ...story, scenes: scenes.map((scene, sceneIndex) => ({ ...scene, order: sceneIndex + 1 })) }));
    this.setState({ notice: '时间线顺序已更新' });
  }

  /**
   * 删除场景但保留批注：线程仍指向原场景 ID，并盖上删除时的场景标题进入归档，
   * 侧边栏待办里继续可见可解决，绝不会错位到其他场景或凭空消失。
   */
  deleteScene(sceneId: string): void {
    const story = this.requireStory();
    const scene = story.scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    const remaining = orderedScenes(story).filter((item) => item.id !== sceneId);
    const archivedThreads = story.comments.map((thread) =>
      thread.sceneId === sceneId ? { ...thread, sceneTitle: scene.title } : thread,
    );
    const fallbackSelection = remaining.find((item) => item.order > scene.order)?.id ?? remaining[remaining.length - 1]?.id ?? '';
    this.updateStory((current) => ({
      ...current,
      scenes: remaining.map((item, index) => ({ ...item, order: index + 1 })),
      comments: archivedThreads,
      selectedSceneId: current.selectedSceneId === sceneId ? fallbackSelection : current.selectedSceneId,
    }));
    const openThreads = archivedThreads.filter((thread) => thread.sceneId === sceneId && !thread.resolved).length;
    this.setState({
      notice:
        openThreads > 0
          ? `场景「${scene.title}」已删除，${openThreads} 条未解决批注已归档到侧边栏待办`
          : `场景「${scene.title}」已删除`,
    });
  }

  addComment(sceneId: string, author: string, body: string): void {
    const cleanBody = body.trim();
    if (cleanBody.length === 0) {
      this.setState({ notice: '批注内容不能为空' });
      return;
    }
    const story = this.requireStory();
    const scene = story.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      this.setState({ notice: '场景已删除，不能再添加批注' });
      return;
    }
    const thread: StoryCommentThread = {
      id: createId('thread'),
      sceneId,
      sceneTitle: scene.title,
      resolved: false,
      comments: [
        {
          id: createId('comment'),
          author: author.trim() || '未署名',
          body: cleanBody,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    this.updateStory((current) => ({ ...current, comments: [...current.comments, thread] }));
    this.setState({ notice: '批注已挂到这一场景' });
  }

  replyToThread(threadId: string, author: string, body: string): void {
    const cleanBody = body.trim();
    if (cleanBody.length === 0) {
      this.setState({ notice: '回复内容不能为空' });
      return;
    }
    this.updateStory((current) => ({
      ...current,
      comments: current.comments.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              comments: [
                ...thread.comments,
                { id: createId('comment'), author: author.trim() || '未署名', body: cleanBody, createdAt: new Date().toISOString() },
              ],
            }
          : thread,
      ),
    }));
  }

  resolveThread(threadId: string): void {
    this.patchThread(threadId, { resolved: true });
    this.setState({ notice: '批注已标记为解决' });
  }

  reopenThread(threadId: string): void {
    this.patchThread(threadId, { resolved: false });
    this.setState({ notice: '批注已重新打开' });
  }

  /** 侧边栏待办点击：选中对应场景并清掉搜索过滤，让目标场景在时间线上可见。 */
  focusThread(threadId: string): void {
    const thread = this.requireStory().comments.find((item) => item.id === threadId);
    if (!thread) return;
    this.updateStory((story) => ({ ...story, selectedSceneId: thread.sceneId }), false);
    this.setState({ search: '' });
  }

  private patchThread(threadId: string, patch: Partial<StoryCommentThread>): void {
    this.updateStory((story) => ({
      ...story,
      comments: story.comments.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)),
    }), false);
  }

  addClue(title: string, setupSceneId: string, payoffSceneId: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    if (!setupSceneId) {
      this.setState({ notice: '请先选择伏笔埋下的场景' });
      return;
    }
    const clue: StoryClue = { id: createId('clue'), title: cleanTitle, setupSceneId, payoffSceneId };
    this.updateStory((story) => ({
      ...story,
      clues: [...story.clues, clue],
      scenes: story.scenes.map((scene) => scene.id === setupSceneId ? { ...scene, clueIds: [...scene.clueIds, clue.id] } : scene),
    }));
    this.setState({ notice: payoffSceneId ? '伏笔关系已建立' : '伏笔已记录，等待回收' });
  }

  completeProject(): void {
    const openCount = this.requireStory().comments.filter((thread) => !thread.resolved).length;
    this.updateStory((story) => ({ ...story, status: 'complete' }));
    this.setState({
      status: 'completed',
      // 只提示、不拦截：作者可以带着未解决批注收尾。
      notice: openCount > 0 ? `项目已标记为完成，仍有 ${openCount} 条未解决批注，可在侧边栏继续处理` : '项目已标记为完成，仍可继续编辑',
    });
  }

  resetProject(): void {
    const story = createStarterStory();
    this.persist(story);
    this.setState({ status: 'ready', story, stats: getStats(story), notice: '已恢复示例项目', error: '' });
  }

  get visibleCharacters(): StoryCharacter[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return story.characters.filter((character) => `${character.name}${character.role}`.toLowerCase().includes(keyword));
  }

  get visibleScenes(): StoryScene[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return orderedScenes(story).filter((scene) => `${scene.title}${scene.summary}${scene.conflict}`.toLowerCase().includes(keyword));
  }

  get selectedScene(): StoryScene | null {
    const story = this.state.story;
    return story?.scenes.find((scene) => scene.id === story.selectedSceneId) ?? null;
  }

  get openThreads(): StoryCommentThread[] {
    const story = this.state.story;
    return story ? unresolvedThreads(story) : [];
  }

  /** 已删除场景上仍未解决的归档批注，侧边栏单列一组。 */
  get orphanThreads(): StoryCommentThread[] {
    const story = this.state.story;
    return story ? story.comments.filter((thread) => !thread.resolved && isOrphanThread(story, thread)) : [];
  }

  threadsOf(sceneId: string): StoryCommentThread[] {
    const story = this.state.story;
    return story ? threadsForScene(story, sceneId) : [];
  }

  unresolvedCountForScene(sceneId: string): number {
    return this.threadsOf(sceneId).filter((thread) => !thread.resolved).length;
  }

  isThreadOrphan(thread: StoryCommentThread): boolean {
    const story = this.state.story;
    return story ? isOrphanThread(story, thread) : true;
  }

  get timelineWarning(): string | null {
    const story = this.state.story;
    return story ? getTimelineWarning(story) : null;
  }

  private requireStory(): StoryDocument {
    if (!this.state.story) throw new Error('故事尚未初始化');
    return this.state.story;
  }

  private updateStory(updater: (story: StoryDocument) => StoryDocument, showEditing = true): void {
    const story = updater(this.requireStory());
    this.persist(story);
    this.setState({ story, stats: getStats(story), status: showEditing ? 'editing' : this.state.status, error: '' });
  }

  private persist(story: StoryDocument): void {
    try {
      this.repository.save({ ...story, updatedAt: new Date().toISOString() });
    } catch {
      this.setState({ status: 'error', error: '保存失败，但当前编辑仍保留在页面中。' });
    }
  }

  private setState(patch: Partial<StoryViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
