export type StoryStatus = 'draft' | 'complete';

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface StoryScene {
  id: string;
  title: string;
  order: number;
  summary: string;
  conflict: string;
  characterIds: string[];
  clueIds: string[];
}

export interface StoryClue {
  id: string;
  title: string;
  setupSceneId: string;
  payoffSceneId: string;
}

export interface StoryComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface StoryCommentThread {
  id: string;
  sceneId: string;
  /** 最近一次所知的场景标题，仅在场景被删除后用于展示归档线程。 */
  sceneTitle: string;
  resolved: boolean;
  comments: StoryComment[];
}

export interface StoryDocument {
  version: 1;
  id: string;
  title: string;
  status: StoryStatus;
  characters: StoryCharacter[];
  scenes: StoryScene[];
  clues: StoryClue[];
  comments: StoryCommentThread[];
  selectedSceneId: string;
  updatedAt: string;
}

export interface StoryStats {
  characters: number;
  scenes: number;
  clues: number;
  unresolvedClues: number;
  unresolvedComments: number;
  completion: number;
}

export const characterColors = ['coral', 'blue', 'gold', 'sage', 'violet'] as const;

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createStarterStory(): StoryDocument {
  const miraId = 'character-mira';
  const oldHarborId = 'scene-old-harbor';
  const firstLetterId = 'clue-first-letter';
  return {
    version: 1,
    id: 'story-last-lighthouse',
    title: '最后的灯塔',
    status: 'draft',
    characters: [
      { id: miraId, name: '米拉', role: '灯塔守望人', color: 'coral' },
      { id: 'character-june', name: '裘恩', role: '失踪船长的女儿', color: 'blue' },
    ],
    scenes: [
      {
        id: oldHarborId,
        title: '旧港口的来信',
        order: 1,
        summary: '米拉收到一封来自已故船长的信，潮汐表背面写着一个日期。',
        conflict: '她必须决定是否相信一封不可能寄出的信。',
        characterIds: [miraId],
        clueIds: [firstLetterId],
      },
      {
        id: 'scene-storm',
        title: '风暴前夜',
        order: 2,
        summary: '裘恩抵达灯塔，带来一枚从沉船上找到的铜制罗盘。',
        conflict: '两人对罗盘的来历各执一词。',
        characterIds: [miraId, 'character-june'],
        clueIds: [],
      },
    ],
    clues: [
      {
        id: firstLetterId,
        title: '潮汐表背后的日期',
        setupSceneId: oldHarborId,
        payoffSceneId: '',
      },
    ],
    comments: [
      {
        id: 'thread-letter-timing',
        sceneId: oldHarborId,
        sceneTitle: '旧港口的来信',
        resolved: false,
        comments: [
          { id: 'comment-editor-1', author: '编辑', body: '开篇节奏很好，但这封信为什么没有邮戳？建议补一个细节。', createdAt: '2026-09-21T09:12:00.000Z' },
          { id: 'comment-author-1', author: '作者', body: '好主意，我让米拉在信纸上发现水渍和盐粒。', createdAt: '2026-09-21T10:05:00.000Z' },
        ],
      },
    ],
    selectedSceneId: oldHarborId,
    updatedAt: new Date().toISOString(),
  };
}
