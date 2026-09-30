import { createId, type CommentAuthor, type CommentMessage, type SceneAnnotation, type StoryDocument } from './story';

export function createMessage(author: CommentAuthor, body: string, now = new Date().toISOString()): CommentMessage {
  return { id: createId('message'), author, body: body.trim(), createdAt: now };
}

export function createAnnotation(sceneId: string, sceneTitle: string, author: CommentAuthor, body: string, now = new Date().toISOString()): SceneAnnotation {
  const firstMessage = createMessage(author, body, now);
  return {
    id: createId('annotation'),
    sceneId,
    sceneTitle,
    resolved: false,
    messages: [firstMessage],
    createdAt: now,
    updatedAt: now,
  };
}

/** 一个场景上的全部批注线程（按最后活动时间倒序，最近讨论在前） */
export function annotationsForScene(story: StoryDocument, sceneId: string): SceneAnnotation[] {
  return story.annotations
    .filter((annotation) => annotation.sceneId === sceneId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 侧边栏待办：所有未解决的线程，按最后活动时间倒序 */
export function openAnnotations(story: StoryDocument): SceneAnnotation[] {
  return story.annotations
    .filter((annotation) => !annotation.resolved)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 场景已被删除、但批注仍要保留的线程，集中收纳在侧边栏 */
export function orphanAnnotations(story: StoryDocument): SceneAnnotation[] {
  const sceneIds = new Set(story.scenes.map((scene) => scene.id));
  return story.annotations
    .filter((annotation) => !sceneIds.has(annotation.sceneId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function isOrphan(annotation: SceneAnnotation, story: StoryDocument): boolean {
  return !story.scenes.some((scene) => scene.id === annotation.sceneId);
}

export function findAnnotation(story: StoryDocument, annotationId: string): SceneAnnotation | undefined {
  return story.annotations.find((annotation) => annotation.id === annotationId);
}

export function lastMessage(annotation: SceneAnnotation): CommentMessage | undefined {
  return annotation.messages[annotation.messages.length - 1];
}
