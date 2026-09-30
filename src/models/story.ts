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

export type CommentAuthor = 'author' | 'editor';

export interface CommentMessage {
  id: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
}

export interface SceneAnnotation {
  id: string;
  sceneId: string;
  /** 场景标题的快照：场景改名后显示当前标题，场景被删后用它保留上下文 */
  sceneTitle: string;
  resolved: boolean;
  messages: CommentMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryDocument {
  version: 1;
  id: string;
  title: string;
  status: StoryStatus;
  characters: StoryCharacter[];
  scenes: StoryScene[];
  clues: StoryClue[];
  /** 批注线程与场景通过稳定的 sceneId 绑定，不依赖顺序或标题；老项目里可能缺省，按空数组处理 */
  annotations: SceneAnnotation[];
  selectedSceneId: string;
  updatedAt: string;
}

export interface StoryStats {
  characters: number;
  scenes: number;
  clues: number;
  unresolvedClues: number;
  openAnnotations: number;
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
    annotations: [
      {
        id: 'annotation-harbor-date',
        sceneId: oldHarborId,
        sceneTitle: '旧港口的来信',
        resolved: false,
        messages: [
          { id: 'message-harbor-date-1', author: 'editor', body: '潮汐表背面的日期建议在这一幕直接写出具体数字，读者后面才能回收。', createdAt: '2026-09-20T09:12:00.000Z' },
          { id: 'message-harbor-date-2', author: 'author', body: '同意，我把日期定成十一月初三，和灯塔停电的日子呼应。', createdAt: '2026-09-20T10:05:00.000Z' },
        ],
        createdAt: '2026-09-20T09:12:00.000Z',
        updatedAt: '2026-09-20T10:05:00.000Z',
      },
      {
        id: 'annotation-storm-compass',
        sceneId: 'scene-storm',
        sceneTitle: '风暴前夜',
        resolved: true,
        messages: [
          { id: 'message-storm-compass-1', author: 'editor', body: '罗盘的来历可以留一点悬念，不用在这里解释太多。', createdAt: '2026-09-21T14:30:00.000Z' },
        ],
        createdAt: '2026-09-21T14:30:00.000Z',
        updatedAt: '2026-09-22T08:00:00.000Z',
      },
    ],
    selectedSceneId: oldHarborId,
    updatedAt: new Date().toISOString(),
  };
}
