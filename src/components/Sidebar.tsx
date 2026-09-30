import type { StoryStats } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface SidebarProps {
  viewModel: StoryViewModel;
  stats: StoryStats;
}

function snippet(thread: { comments: { body: string }[] }): string {
  return thread.comments[thread.comments.length - 1]?.body ?? '';
}

export function Sidebar({ viewModel, stats }: SidebarProps) {
  const { story, activeSection } = viewModel.snapshot;
  const openThreads = viewModel.openThreads;
  const orphanIds = new Set(viewModel.orphanThreads.map((thread) => thread.id));
  const liveThreads = openThreads.filter((thread) => !orphanIds.has(thread.id));
  const archivedThreads = openThreads.filter((thread) => orphanIds.has(thread.id));
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><span>StoryArchitect</span></div>
      <div className="project-switcher"><span className="eyebrow">当前项目</span><strong>{story?.title ?? '正在加载…'}</strong><span className="project-dot" /></div>
      <nav className="side-nav" aria-label="主要导航">
        <button className={activeSection === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('overview')}><span>◈</span>故事总览</button>
        <button className={activeSection === 'characters' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('characters')}><span>♧</span>人物关系</button>
        <button className={activeSection === 'clues' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('clues')}><span>⌁</span>伏笔关系</button>
      </nav>
      <div className="comment-todo">
        <div className="todo-head"><span className="eyebrow">批注待办</span>{openThreads.length > 0 && <span className="todo-badge">{openThreads.length}</span>}</div>
        {openThreads.length === 0 && <div className="todo-empty">没有未解决批注，可以安心收尾。</div>}
        <div className="todo-scroll">
          {liveThreads.map((thread) => {
            const scene = story?.scenes.find((item) => item.id === thread.sceneId);
            return (
              <button className="todo-item" key={thread.id} onClick={() => viewModel.focusThread(thread.id)} title="跳到对应场景">
                <span className="todo-scene">▸ {scene?.title ?? thread.sceneTitle}</span>
                <span className="todo-body">{snippet(thread)}</span>
                <span className="todo-meta">{thread.comments.length} 条对话</span>
              </button>
            );
          })}
          {archivedThreads.length > 0 && <div className="todo-group-label">已删除场景 · 批注已归档</div>}
          {archivedThreads.map((thread) => (
            <div className="todo-item archived" key={thread.id}>
              <div className="todo-item-row">
                <span className="todo-scene">▸ {thread.sceneTitle}</span>
                <button className="todo-resolve" onClick={() => viewModel.resolveThread(thread.id)}>解决</button>
              </div>
              <span className="todo-body">{snippet(thread)}</span>
              <span className="todo-meta">场景已删除，线程保留不会丢失</span>
            </div>
          ))}
        </div>
      </div>
      <div className="sidebar-bottom">
        <div className="mini-progress"><div><span>结构完成度</span><b>{stats.completion}%</b></div><div className="progress-track"><span style={{ width: `${stats.completion}%` }} /></div></div>
        <button className="reset-link" onClick={() => viewModel.resetProject()}>↻ 恢复示例项目</button>
        <span className="saved-state">● 本地自动保存</span>
      </div>
    </aside>
  );
}
