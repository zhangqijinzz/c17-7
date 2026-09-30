import {
  characterColors,
  createId,
  createStarterStory,
  type CommentAuthor,
  type SceneAnnotation,
  type StoryCharacter,
  type StoryClue,
  type StoryDocument,
  type StoryScene,
} from '../models/story';
import {
  annotationsForScene,
  createAnnotation,
  createMessage,
  findAnnotation,
  isOrphan,
  openAnnotations,
  orphanAnnotations,
} from '../models/annotations';
import { getStats, getTimelineWarning, orderedScenes, validateName } from '../models/storyRules';
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
    stats: { characters: 0, scenes: 0, clues: 0, unresolvedClues: 0, openAnnotations: 0, completion: 0 },
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
      // 改名时同步批注上的标题快照；绑定关系始终靠 sceneId，不靠标题
      annotations: patch.title
        ? story.annotations.map((annotation) => (annotation.sceneId === sceneId ? { ...annotation, sceneTitle: patch.title as string } : annotation))
        : story.annotations,
    }), false);
  }

  deleteScene(sceneId: string): void {
    const target = this.requireStory().scenes.find((scene) => scene.id === sceneId);
    if (!target) return;
    const linkedAnnotations = this.requireStory().annotations.filter((annotation) => annotation.sceneId === sceneId).length;
    this.updateStory((story) => {
      const remaining = orderedScenes(story)
        .filter((scene) => scene.id !== sceneId)
        .map((scene, index) => ({ ...scene, order: index + 1 }));
      return {
        ...story,
        scenes: remaining,
        selectedSceneId: story.selectedSceneId === sceneId ? remaining[0]?.id ?? '' : story.selectedSceneId,
      };
    });
    // 批注不随场景删除：它们以孤儿线程保留在侧边栏待办里，任何时候都能找回
    this.setState({
      notice: linkedAnnotations > 0
        ? `场景「${target.title}」已删除，${linkedAnnotations} 条批注保留在侧边栏待办中，不会丢失。`
        : `场景「${target.title}」已删除。`,
    });
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
    // 只动 order：批注按 sceneId 绑定，重排后自然跟着场景走，无需改动批注
    this.updateStory((story) => ({ ...story, scenes: scenes.map((scene, sceneIndex) => ({ ...scene, order: sceneIndex + 1 })) }));
    this.setState({ notice: '时间线顺序已更新' });
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

  addAnnotation(sceneId: string, body: string, author: CommentAuthor): void {
    const content = body.trim();
    if (content.length < 2) {
      this.setState({ notice: '批注至少写 2 个字' });
      return;
    }
    const scene = this.requireStory().scenes.find((item) => item.id === sceneId);
    if (!scene) {
      this.setState({ notice: '场景不存在，批注无法挂载' });
      return;
    }
    const annotation = createAnnotation(sceneId, scene.title, author, content);
    this.updateStory((story) => ({ ...story, annotations: [...story.annotations, annotation] }));
    this.setState({ notice: '批注已挂到场景上' });
  }

  replyToAnnotation(annotationId: string, body: string, author: CommentAuthor): void {
    const content = body.trim();
    if (content.length < 2) {
      this.setState({ notice: '回复至少写 2 个字' });
      return;
    }
    const now = new Date().toISOString();
    this.updateStory((story) => ({
      ...story,
      annotations: story.annotations.map((annotation) =>
        annotation.id === annotationId && !annotation.resolved
          ? { ...annotation, messages: [...annotation.messages, createMessage(author, content, now)], updatedAt: now }
          : annotation,
      ),
    }));
  }

  resolveAnnotation(annotationId: string): void {
    const now = new Date().toISOString();
    this.updateStory((story) => ({
      ...story,
      annotations: story.annotations.map((annotation) =>
        annotation.id === annotationId ? { ...annotation, resolved: true, updatedAt: now } : annotation,
      ),
    }));
    this.setState({ notice: '批注已标记为解决' });
  }

  reopenAnnotation(annotationId: string): void {
    const now = new Date().toISOString();
    this.updateStory((story) => ({
      ...story,
      annotations: story.annotations.map((annotation) =>
        annotation.id === annotationId ? { ...annotation, resolved: false, updatedAt: now } : annotation,
      ),
    }));
    this.setState({ notice: '批注已重新打开' });
  }

  /** 侧边栏待办点击：跳转到批注所在场景；场景已删除时不跳转 */
  focusAnnotation(annotationId: string): boolean {
    const story = this.requireStory();
    const annotation = findAnnotation(story, annotationId);
    if (!annotation || isOrphan(annotation, story)) return false;
    this.selectScene(annotation.sceneId);
    return true;
  }

  completeProject(): void {
    const openCount = this.requireStory().annotations.filter((annotation) => !annotation.resolved).length;
    this.updateStory((story) => ({ ...story, status: 'complete' }));
    // 有未解决批注只做明确提示，绝不阻断收尾
    this.setState({
      status: 'completed',
      notice: openCount > 0
        ? `还有 ${openCount} 条批注未解决，项目仍已标记完成；可随时回来处理，不必现在解决。`
        : '项目已标记为完成，仍可继续编辑',
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

  get timelineWarning(): string | null {
    const story = this.state.story;
    return story ? getTimelineWarning(story) : null;
  }

  get openAnnotationThreads(): SceneAnnotation[] {
    return this.state.story ? openAnnotations(this.state.story) : [];
  }

  get orphanAnnotationThreads(): SceneAnnotation[] {
    return this.state.story ? orphanAnnotations(this.state.story) : [];
  }

  annotationsOnScene(sceneId: string): SceneAnnotation[] {
    return this.state.story ? annotationsForScene(this.state.story, sceneId) : [];
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
