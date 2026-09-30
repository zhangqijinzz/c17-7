import { useState } from 'react';
import type { StoryCommentThread } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

const AUTHOR_KEY = 'story-architect.comment-author';

function readStoredAuthor(): string {
  try {
    return window.localStorage.getItem(AUTHOR_KEY) ?? '作者';
  } catch {
    return '作者';
  }
}

function formatTime(iso: string): string {
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16);
}

interface SceneCommentsProps {
  viewModel: StoryViewModel;
  sceneId: string;
  threads: StoryCommentThread[];
}

export function SceneComments({ viewModel, sceneId, threads }: SceneCommentsProps) {
  const [author, setAuthor] = useState(readStoredAuthor);
  const [draft, setDraft] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});

  const persistAuthor = (value: string) => {
    setAuthor(value);
    try {
      window.localStorage.setItem(AUTHOR_KEY, value);
    } catch {
      /* 私密模式等场景下忽略持久化失败 */
    }
  };

  const submit = () => {
    viewModel.addComment(sceneId, author, draft);
    setDraft('');
  };

  const submitReply = (threadId: string) => {
    viewModel.replyToThread(threadId, author, replies[threadId] ?? '');
    setReplies((current) => ({ ...current, [threadId]: '' }));
  };

  const openCount = threads.filter((thread) => !thread.resolved).length;

  return (
    <div className="comment-block">
      <div className="comment-block-head">
        <span className="field-label">场景批注</span>
        <span className={openCount > 0 ? 'comment-count alert' : 'comment-count'}>{openCount} 条未解决</span>
      </div>
      <div className="thread-list">
        {threads.map((thread) => {
          const resolved = thread.resolved;
          return (
            <article className={resolved ? 'comment-thread resolved' : 'comment-thread'} key={thread.id}>
              <div className="thread-head">
                <em className={resolved ? 'thread-state solved' : 'thread-state'}>{resolved ? '✓ 已解决' : '● 待处理'}</em>
                {resolved
                  ? <button className="thread-link" onClick={() => viewModel.reopenThread(thread.id)}>重新打开</button>
                  : <button className="thread-link" onClick={() => viewModel.resolveThread(thread.id)}>标记已解决</button>}
              </div>
              {thread.comments.map((comment) => (
                <div className="comment-item" key={comment.id}>
                  <div className="comment-meta"><strong>{comment.author}</strong><time>{formatTime(comment.createdAt)}</time></div>
                  <p>{comment.body}</p>
                </div>
              ))}
              {!resolved && (
                <div className="reply-row">
                  <input
                    aria-label="回复批注"
                    value={replies[thread.id] ?? ''}
                    onChange={(event) => setReplies((current) => ({ ...current, [thread.id]: event.target.value }))}
                    onKeyDown={(event) => event.key === 'Enter' && submitReply(thread.id)}
                    placeholder="回复这条线程…"
                  />
                  <button className="reply-button" onClick={() => submitReply(thread.id)}>回复</button>
                </div>
              )}
            </article>
          );
        })}
        {threads.length === 0 && <div className="empty-inline">还没有批注。作者和编辑可以在这里围绕这一场景讨论。</div>}
      </div>
      <div className="comment-form">
        <input className="comment-author" aria-label="批注署名" value={author} onChange={(event) => persistAuthor(event.target.value)} placeholder="署名" />
        <textarea
          aria-label="新批注内容"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="针对这一场景写一条批注…"
        />
        <button className="comment-submit" onClick={submit}>＋ 添加批注</button>
      </div>
    </div>
  );
}
