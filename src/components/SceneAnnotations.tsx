import { useState } from 'react';
import type { CommentAuthor, SceneAnnotation, StoryScene } from '../models/story';
import { lastMessage } from '../models/annotations';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

const authorLabel: Record<CommentAuthor, string> = { author: '作者', editor: '编辑' };

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function AuthorSwitch({ value, onChange, label }: { value: CommentAuthor; onChange: (author: CommentAuthor) => void; label: string }) {
  return (
    <div className="comment-author-switch" role="group" aria-label={label}>
      <button type="button" className={value === 'author' ? 'author-role selected' : 'author-role'} onClick={() => onChange('author')}>作者</button>
      <button type="button" className={value === 'editor' ? 'author-role selected' : 'author-role'} onClick={() => onChange('editor')}>编辑</button>
    </div>
  );
}

function ThreadCard({ viewModel, thread }: { viewModel: StoryViewModel; thread: SceneAnnotation }) {
  const [reply, setReply] = useState('');
  const [replyAuthor, setReplyAuthor] = useState<CommentAuthor>('author');
  const last = lastMessage(thread);
  return (
    <article className={thread.resolved ? 'comment-thread resolved' : 'comment-thread'}>
      <header className="comment-thread-head">
        <span className={`comment-role ${thread.messages[0]?.author}`}>{authorLabel[thread.messages[0]?.author ?? 'author']}</span>
        <span className="comment-time">{formatTime(thread.createdAt)}</span>
        {thread.resolved && <em className="comment-state resolved-state">已解决</em>}
      </header>
      <div className="comment-messages">
        {thread.messages.map((message) => (
          <div className="comment-message" key={message.id}>
            <p>{message.body}</p>
            <span className={`comment-role ${message.author}`}>{authorLabel[message.author]}</span>
            <span className="comment-time">{formatTime(message.createdAt)}</span>
          </div>
        ))}
      </div>
      {thread.resolved ? (
        <footer className="comment-thread-foot">
          <span className="comment-resolved-hint">由 {last ? authorLabel[last.author] : ''} 于 {last ? formatTime(thread.updatedAt) : ''} 解决</span>
          <button type="button" className="comment-reopen-button" onClick={() => viewModel.reopenAnnotation(thread.id)}>↺ 重新打开</button>
        </footer>
      ) : (
        <>
          <div className="comment-reply">
            <textarea
              aria-label="回复批注"
              rows={2}
              value={reply}
              placeholder="写下回复…"
              onChange={(event) => setReply(event.target.value)}
            />
            <div className="comment-reply-foot">
              <AuthorSwitch value={replyAuthor} onChange={setReplyAuthor} label="回复身份" />
              <button
                type="button"
                onClick={() => { viewModel.replyToAnnotation(thread.id, reply, replyAuthor); setReply(''); }}
              >回复</button>
            </div>
          </div>
          <footer className="comment-thread-foot">
            <button type="button" className="comment-resolve-button" onClick={() => viewModel.resolveAnnotation(thread.id)}>✓ 标记已解决</button>
          </footer>
        </>
      )}
    </article>
  );
}

interface SceneAnnotationsProps {
  viewModel: StoryViewModel;
  scene: StoryScene;
}

export function SceneAnnotations({ viewModel, scene }: SceneAnnotationsProps) {
  const threads = viewModel.annotationsOnScene(scene.id);
  const openThreads = threads.filter((thread) => !thread.resolved);
  const resolvedThreads = threads.filter((thread) => thread.resolved);
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState<CommentAuthor>('author');
  return (
    <div className="field-block comment-block">
      <span className="field-label">场景批注{openThreads.length > 0 && <i className="comment-count">{openThreads.length} 条待处理</i>}</span>
      {threads.length === 0 && <p className="comment-empty">还没有批注。作者和编辑可以直接在这个场景上发起讨论。</p>}
      <div className="comment-thread-list">
        {[...openThreads, ...resolvedThreads].map((thread) => <ThreadCard key={thread.id} viewModel={viewModel} thread={thread} />)}
      </div>
      <div className="comment-compose">
        <textarea
          aria-label="新建批注"
          rows={2}
          value={body}
          placeholder="给这个场景加一条批注…"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="comment-reply-foot">
          <AuthorSwitch value={author} onChange={setAuthor} label="批注身份" />
          <button type="button" onClick={() => { viewModel.addAnnotation(scene.id, body, author); setBody(''); }}>挂批注</button>
        </div>
      </div>
    </div>
  );
}
