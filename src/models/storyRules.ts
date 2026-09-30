import type { CommentAuthor, CommentMessage, SceneAnnotation, StoryDocument, StoryScene, StoryStats } from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '');
  const openAnnotations = story.annotations.filter((annotation) => !annotation.resolved).length;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  const completedSignals = story.characters.length + story.scenes.length + (story.clues.length - unresolvedClues.length);
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues: unresolvedClues.length,
    openAnnotations,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function sanitizeMessage(value: unknown): CommentMessage | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.id !== 'string' ||
    (record.author !== 'author' && record.author !== 'editor') ||
    typeof record.body !== 'string' ||
    typeof record.createdAt !== 'string'
  ) {
    return null;
  }
  return { id: record.id, author: record.author as CommentAuthor, body: record.body, createdAt: record.createdAt };
}

function sanitizeAnnotation(value: unknown): SceneAnnotation | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.id !== 'string' ||
    typeof record.sceneId !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string' ||
    !Array.isArray(record.messages)
  ) {
    return null;
  }
  const messages = record.messages.map(sanitizeMessage).filter((message): message is CommentMessage => message !== null);
  if (messages.length === 0) return null;
  const fallbackTitle = messages[0]?.body.slice(0, 20) ?? '已删除的场景';
  return {
    id: record.id,
    sceneId: record.sceneId,
    sceneTitle: typeof record.sceneTitle === 'string' && record.sceneTitle ? record.sceneTitle : fallbackTitle,
    resolved: record.resolved === true,
    messages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sanitizeScene(value: unknown): StoryScene | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.order !== 'number') return null;
  return {
    id: record.id,
    title: record.title,
    order: record.order,
    summary: typeof record.summary === 'string' ? record.summary : '',
    conflict: typeof record.conflict === 'string' ? record.conflict : '',
    characterIds: Array.isArray(record.characterIds) ? record.characterIds.filter((id): id is string => typeof id === 'string') : [],
    clueIds: Array.isArray(record.clueIds) ? record.clueIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

function sanitizeCharacter(value: unknown): StoryDocument['characters'][number] | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    name: record.name,
    role: typeof record.role === 'string' ? record.role : '',
    color: typeof record.color === 'string' ? record.color : 'coral',
  };
}

function sanitizeClue(value: unknown): StoryDocument['clues'][number] | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.setupSceneId !== 'string') return null;
  return {
    id: record.id,
    title: record.title,
    setupSceneId: record.setupSceneId,
    payoffSceneId: typeof record.payoffSceneId === 'string' ? record.payoffSceneId : '',
  };
}

/**
 * 读取并迁移历史存档：
 * - version 1 的老项目没有 annotations 字段，迁移成空数组而不是报错（待办自然为空）；
 * - 批注与场景靠稳定 id 绑定，场景在存档里缺失时批注也原样保留为「孤儿批注」；
 * - 结构整体不合法（非对象、版本不符、缺主键）才返回 null，由上层回退示例项目。
 */
export function sanitizeStory(input: unknown): StoryDocument | null {
  const candidate = asRecord(input);
  if (
    !candidate ||
    candidate.version !== 1 ||
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.scenes)
  ) {
    return null;
  }
  const scenes = candidate.scenes.map(sanitizeScene).filter((scene): scene is StoryScene => scene !== null);
  return {
    version: 1,
    id: candidate.id,
    title: candidate.title,
    status: candidate.status === 'complete' ? 'complete' : 'draft',
    characters: Array.isArray(candidate.characters)
      ? candidate.characters.map(sanitizeCharacter).filter((character): character is StoryDocument['characters'][number] => character !== null)
      : [],
    scenes,
    clues: Array.isArray(candidate.clues)
      ? candidate.clues.map(sanitizeClue).filter((clue): clue is StoryDocument['clues'][number] => clue !== null)
      : [],
    annotations: Array.isArray(candidate.annotations)
      ? candidate.annotations.map(sanitizeAnnotation).filter((annotation): annotation is SceneAnnotation => annotation !== null)
      : [],
    selectedSceneId: typeof candidate.selectedSceneId === 'string' ? candidate.selectedSceneId : scenes[0]?.id ?? '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
  };
}
