"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Reply, Send, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
interface CommentAuthor {
  id: string;
  name: string | null;
  avatar: string | null;
  role: string;
}

interface CommentReply {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
  replies: CommentReply[];
}

interface DiscussionPanelProps {
  courseId: string;
  lessonId?: string;
  userId: string;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  return `${months}mo ago`;
}

// ─────────────────────────────────────────────────────
// Comment Skeleton
// ─────────────────────────────────────────────────────
function CommentSkeleton() {
  return (
    <div className="flex gap-3 py-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Discussion Panel
// ─────────────────────────────────────────────────────
export function DiscussionPanel({ courseId, lessonId, userId }: DiscussionPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    authorName: string;
  } | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  /** Fetch comments */
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ courseId });
      if (lessonId) params.set("lessonId", lessonId);
      const res = await fetch(`/api/comments?${params}`);
      const json = await res.json();
      if (json.success) {
        setComments(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  /** Auto-focus reply textarea when replying */
  useEffect(() => {
    if (replyingTo) {
      setTimeout(() => replyTextareaRef.current?.focus(), 50);
    }
  }, [replyingTo]);

  /** Submit a new top-level comment */
  const handleSubmitComment = async () => {
    const content = newComment.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          courseId,
          lessonId: lessonId || undefined,
          userId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewComment("");
        toast.success("Comment posted!");
        fetchComments();
      } else {
        toast.error(json.error || "Failed to post comment");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Submit a reply */
  const handleSubmitReply = async () => {
    if (!replyingTo || !replyContent.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          courseId,
          lessonId: lessonId || undefined,
          parentId: replyingTo.id,
          userId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setReplyContent("");
        setReplyingTo(null);
        toast.success("Reply posted!");
        fetchComments();
      } else {
        toast.error(json.error || "Failed to post reply");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Delete a comment */
  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/${commentId}?userId=${userId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Comment deleted.");
        fetchComments();
      } else {
        toast.error(json.error || "Failed to delete comment");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  /** Keyboard shortcuts */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, submitFn: () => void) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitFn();
    }
    if (e.key === "Escape") {
      if (replyingTo) {
        setReplyingTo(null);
        setReplyContent("");
      }
    }
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* ─── Header ─── */}
      <div className="mb-4 flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <button className="group flex cursor-pointer items-center gap-2.5">
            <div className="from-primary to-accent h-7 w-1 rounded-full bg-gradient-to-b" />
            <h2 className="text-foreground flex items-center gap-2 text-xl font-bold">
              <MessageSquare className="text-primary h-5 w-5" />
              Discussion
              {totalComments > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-primary/10 text-primary ml-1 border-0 text-xs font-medium"
                >
                  {totalComments}
                </Badge>
              )}
            </h2>
            {isOpen ? (
              <ChevronUp className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
            ) : (
              <ChevronDown className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
            )}
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        {/* ─── New Comment Input ─── */}
        <div className="bg-card relative mb-4 rounded-xl border p-4">
          <div className="from-primary/60 via-accent/40 absolute top-0 right-6 left-6 h-[2px] rounded-full bg-gradient-to-r to-transparent" />
          <Textarea
            placeholder="Ask a question or share your thoughts..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleSubmitComment)}
            className="bg-muted/50 focus-visible:ring-primary/30 min-h-[72px] resize-none border-0 text-sm focus-visible:ring-1"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">Ctrl+Enter to send</span>
            <Button
              size="sm"
              className="from-primary to-accent text-primary-foreground h-8 gap-1.5 bg-gradient-to-r px-4 text-xs font-medium hover:opacity-90"
              disabled={!newComment.trim() || submitting}
              onClick={handleSubmitComment}
            >
              {submitting && !replyingTo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Post Comment
            </Button>
          </div>
        </div>

        {/* ─── Comments List ─── */}
        <div className="custom-scrollbar max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="space-y-1">
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-muted mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                <MessageSquare className="text-muted-foreground h-6 w-6" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">No comments yet</p>
              <p className="text-muted-foreground/70 mt-1 text-xs">
                Be the first to start a discussion!
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {comments.map((comment, idx) => (
                <div key={comment.id}>
                  {/* Parent comment */}
                  <div className="py-3">
                    <div className="group flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-teal-500 text-xs font-semibold text-white">
                          {getInitials(comment.author.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-foreground text-sm font-semibold">
                            {comment.author.name || "Anonymous"}
                          </span>
                          {comment.author.role === "instructor" && (
                            <Badge
                              variant="secondary"
                              className="h-4 border-0 bg-cyan-500/10 px-1.5 py-0 text-[10px] text-cyan-600 dark:text-cyan-400"
                            >
                              Instructor
                            </Badge>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-foreground/90 text-sm leading-relaxed break-words whitespace-pre-wrap">
                          {comment.content}
                        </p>
                        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-primary h-7 px-2 text-xs"
                            onClick={() =>
                              setReplyingTo({
                                id: comment.id,
                                authorName: comment.author.name || "someone",
                              })
                            }
                          >
                            <Reply className="mr-1 h-3 w-3" />
                            Reply
                          </Button>
                          {comment.author.id === userId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
                              onClick={() => handleDelete(comment.id)}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nested replies */}
                  {comment.replies.length > 0 && (
                    <div className="border-border/50 ml-8 space-y-0 border-l-2 pl-4">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="py-2">
                          <div className="group flex gap-3">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-teal-500 text-[10px] font-semibold text-white">
                                {getInitials(reply.author.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-foreground text-sm font-semibold">
                                  {reply.author.name || "Anonymous"}
                                </span>
                                {reply.author.role === "instructor" && (
                                  <Badge
                                    variant="secondary"
                                    className="h-4 border-0 bg-cyan-500/10 px-1.5 py-0 text-[10px] text-cyan-600 dark:text-cyan-400"
                                  >
                                    Instructor
                                  </Badge>
                                )}
                                <span className="text-muted-foreground text-xs">
                                  {formatRelativeTime(reply.createdAt)}
                                </span>
                              </div>
                              <p className="text-foreground/90 text-sm leading-relaxed break-words whitespace-pre-wrap">
                                {reply.content}
                              </p>
                              <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                {reply.author.id === userId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
                                    onClick={() => handleDelete(reply.id)}
                                  >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline reply input */}
                  {replyingTo?.id === comment.id && (
                    <div className="border-primary/30 ml-8 border-l-2 py-2 pl-4">
                      <div className="flex gap-3">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-teal-500 text-[10px] font-bold text-white">
                            ME
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted/30 flex-1 rounded-lg border p-2.5">
                          <Textarea
                            ref={replyTextareaRef}
                            placeholder={`Reply to ${replyingTo.authorName}...`}
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, handleSubmitReply)}
                            className="min-h-[44px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                            rows={2}
                          />
                          <div className="mt-1.5 flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyContent("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="from-primary to-accent text-primary-foreground h-7 gap-1 bg-gradient-to-r px-3 text-xs hover:opacity-90"
                              disabled={!replyContent.trim() || submitting}
                              onClick={handleSubmitReply}
                            >
                              {submitting && replyingTo ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="h-3 w-3" />
                              )}
                              Reply
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {idx < comments.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
