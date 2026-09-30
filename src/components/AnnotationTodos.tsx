import type { SceneAnnotation } from '../models/story';
import { lastMessage } from '../models/annotations';
import type { StoryViewModel } from '../viewmodels/storyViewModel';
import { formatTime } from './SceneAnnotations';

function preview(thread: SceneAnnotation): string {
  const text = lastMessage(thread)?.body ?? '';
  return text.length > 26 ? `${text.slice(0, 26)}…` : text;
}

function jumpToScene(viewModel: StoryViewModel, thread: SceneAnnotation): void {
  viewModel.setSearch('');
  if (!viewModel.focusAnnotation(thread.id)) return;
  requestAnimationFrame(() => {
    document.getElementById(`scene-node-${thread.sceneId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function TodoRow({ viewModel, thread, orphan = false }: { viewModel: StoryViewModel; thread: SceneAnnotation; orphan?: boolean }) {
  return (
    <div className={orphan ? 'todo-row orphan' : 'todo-row'}>
      <button
        type="button"
        className="todo-main"
        disabled={orphan}
        title={orphan ? '原场景已删除，无法跳转' : `跳到「${thread.sceneTitle}」`}
        onClick={() => jumpToScene(viewModel, thread)}
      >
        <span className="todo-scene">{thread.sceneTitle}{orphan && <i className="todo-orphan-tag">场景已删除</i>}</span>
        <span className="todo-preview">{preview(thread)}</span>
        <span className="todo-meta">{thread.messages.length} 条对话 · {formatTime(thread.updatedAt)}</span>
      </button>
      <div className="todo-actions">
        {thread.resolved
          ? <button type="button" className="todo-link" onClick={() => viewModel.reopenAnnotation(thread.id)}>重新打开</button>
          : <button type="button" className="todo-link resolve" onClick={() => viewModel.resolveAnnotation(thread.id)}>解决</button>}
      </div>
    </div>
  );
}

export function AnnotationTodos({ viewModel }: { viewModel: StoryViewModel }) {
  const open = viewModel.openAnnotationThreads;
  const orphans = viewModel.orphanAnnotationThreads;
  const orphanIds = new Set(orphans.map((thread) => thread.id));
  const activeOpen = open.filter((thread) => !orphanIds.has(thread.id));
  const orphanOpen = orphans.filter((thread) => !thread.resolved);
  const orphanResolved = orphans.filter((thread) => thread.resolved);
  return (
    <section className="todo-panel" aria-label="批注待办">
      <div className="todo-head">
        <span className="eyebrow">REVIEW / 批注待办</span>
        <span className={open.length > 0 ? 'todo-badge alert' : 'todo-badge'}>{open.length}</span>
      </div>
      {open.length === 0 && orphans.length === 0 && (
        <p className="todo-empty">待办是空的。<br />场景上的未解决批注会集中出现在这里。</p>
      )}
      {activeOpen.length > 0 && (
        <div className="todo-list">
          {activeOpen.map((thread) => (
            <TodoRow key={thread.id} viewModel={viewModel} thread={thread} />
          ))}
        </div>
      )}
      {orphans.length > 0 && (
        <div className="todo-orphan-group">
          <span className="todo-orphan-title">已删除场景留下的批注（{orphans.length}）</span>
          {[...orphanOpen, ...orphanResolved].map((thread) => (
            <TodoRow key={thread.id} viewModel={viewModel} thread={thread} orphan />
          ))}
        </div>
      )}
    </section>
  );
}
