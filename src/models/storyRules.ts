import type { StoryComment, StoryCommentThread, StoryDocument, StoryScene, StoryStats } from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '').length;
  const unresolvedComments = story.comments.filter((thread) => !thread.resolved).length;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  const completedSignals = story.characters.length + story.scenes.length + (story.clues.length - unresolvedClues);
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues,
    unresolvedComments,
    completion,
  };
}

export function validateName(value: string): string {
  const cleanValue = value.trim();
  return cleanValue.length < 2 ? '至少输入 2 个字' : cleanValue;
}

export function getTimelineWarning(story: StoryDocument): string | null {
  const orders = story.scenes.map((scene) => scene.order);
  return new Set(orders).size !== orders.length ? '时间线存在重复顺序，请重新排列。' : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeScene(input: unknown, fallbackOrder: number): StoryScene | null {
  if (!input || typeof input !== 'object') return null;
  const scene = input as Partial<StoryScene>;
  if (typeof scene.id !== 'string' || typeof scene.title !== 'string') return null;
  return {
    id: scene.id,
    title: scene.title,
    order: typeof scene.order === 'number' ? scene.order : fallbackOrder,
    summary: typeof scene.summary === 'string' ? scene.summary : '',
    conflict: typeof scene.conflict === 'string' ? scene.conflict : '',
    characterIds: isStringArray(scene.characterIds) ? scene.characterIds : [],
    clueIds: isStringArray(scene.clueIds) ? scene.clueIds : [],
  };
}

function normalizeComment(input: unknown): StoryComment | null {
  if (!input || typeof input !== 'object') return null;
  const comment = input as Partial<StoryComment>;
  if (typeof comment.id !== 'string' || typeof comment.body !== 'string' || !comment.body.trim()) return null;
  return {
    id: comment.id,
    author: typeof comment.author === 'string' && comment.author.trim() ? comment.author : '未署名',
    body: comment.body,
    createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : new Date().toISOString(),
  };
}

/**
 * 读取任意历史版本的持久化数据：结构合法则补齐缺失字段（老项目没有批注时得到空列表），
 * 数据损坏时返回 null，由仓储层回退到示例项目，绝不让旧项目打开时报错。
 */
export function normalizeStory(input: unknown): StoryDocument | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<StoryDocument>;
  if (
    candidate.version !== 1 ||
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.characters) ||
    !Array.isArray(candidate.scenes) ||
    !Array.isArray(candidate.clues)
  ) {
    return null;
  }
  const scenes = candidate.scenes
    .map((scene, index) => normalizeScene(scene, index + 1))
    .filter((scene): scene is StoryScene => scene !== null);
  const comments = Array.isArray(candidate.comments)
    ? candidate.comments
        .map((thread) => normalizeThread(thread, scenes))
        .filter((thread): thread is StoryCommentThread => thread !== null)
    : [];
  return {
    version: 1,
    id: candidate.id,
    title: candidate.title,
    status: candidate.status === 'complete' ? 'complete' : 'draft',
    characters: candidate.characters.filter(
      (character) => character && typeof character.id === 'string' && typeof character.name === 'string',
    ),
    scenes,
    clues: candidate.clues.filter(
      (clue) => clue && typeof clue.id === 'string' && typeof clue.title === 'string',
    ),
    comments,
    selectedSceneId:
      typeof candidate.selectedSceneId === 'string' && scenes.some((scene) => scene.id === candidate.selectedSceneId)
        ? candidate.selectedSceneId
        : scenes[0]?.id ?? '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
  };
}

/** 兼容旧入口名：校验并迁移持久化文档。 */
export const sanitizeStory = normalizeStory;

function normalizeThread(input: unknown, scenes: StoryScene[]): StoryCommentThread | null {
  if (!input || typeof input !== 'object') return null;
  const thread = input as Partial<StoryCommentThread>;
  if (typeof thread.id !== 'string' || typeof thread.sceneId !== 'string' || !Array.isArray(thread.comments)) return null;
  const comments = thread.comments
    .map((comment) => normalizeComment(comment))
    .filter((comment): comment is StoryComment => comment !== null);
  if (comments.length === 0) return null;
  const scene = scenes.find((item) => item.id === thread.sceneId);
  return {
    id: thread.id,
    sceneId: thread.sceneId,
    // 场景仍在时始终以当前标题为准；场景已删除时保留历史标题用于归档展示。
    sceneTitle: scene?.title ?? (typeof thread.sceneTitle === 'string' && thread.sceneTitle ? thread.sceneTitle : '已删除的场景'),
    resolved: thread.resolved === true,
    comments,
  };
}

/** 批注线程是否属于已不存在的场景（删除场景不会删除线程，只会进入归档）。 */
export function isOrphanThread(story: StoryDocument, thread: StoryCommentThread): boolean {
  return !story.scenes.some((scene) => scene.id === thread.sceneId);
}

export function threadsForScene(story: StoryDocument, sceneId: string): StoryCommentThread[] {
  return story.comments
    .filter((thread) => thread.sceneId === sceneId)
    .sort((a, b) => a.comments[0].createdAt.localeCompare(b.comments[0].createdAt));
}

/** 侧边栏待办：未解决线程，按场景顺序排列；已删除场景的未解决线程排在最后，不消失也不错位。 */
export function unresolvedThreads(story: StoryDocument): StoryCommentThread[] {
  const sceneOrder = new Map(orderedScenes(story).map((scene, index) => [scene.id, index]));
  return story.comments
    .filter((thread) => !thread.resolved)
    .sort((a, b) => {
      const orderA = sceneOrder.get(a.sceneId);
      const orderB = sceneOrder.get(b.sceneId);
      if (orderA === undefined && orderB === undefined) return 0;
      if (orderA === undefined) return 1;
      if (orderB === undefined) return -1;
      if (orderA !== orderB) return orderA - orderB;
      return a.comments[0].createdAt.localeCompare(b.comments[0].createdAt);
    });
}
