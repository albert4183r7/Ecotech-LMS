"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Reply,
  Send,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  sectionId?: string;
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
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
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
export function DiscussionPanel({
  courseId,
  sectionId,
  userId,
}: DiscussionPanelProps) {
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
      if (sectionId) params.set("sectionId", sectionId);
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
  }, [courseId, sectionId]);

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
          sectionId: sectionId || undefined,
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
          sectionId: sectionId || undefined,
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
      const res = await fetch(
        `/api/comments/${commentId}?userId=${userId}`,
        { method: "DELETE" }
      );
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
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    submitFn: () => void
  ) => {
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

  const totalComments = comments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-4">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2.5 group cursor-pointer">
            <div className="h-7 w-1 rounded-full bg-gradient-to-b from-primary to-accent" />
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Discussion
              {totalComments > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-xs font-medium bg-primary/10 text-primary border-0"
                >
                  {totalComments}
                </Badge>
              )}
            </h2>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        {/* ─── New Comment Input ─── */}
        <div className="relative rounded-xl border bg-card p-4 mb-4">
          <div className="absolute top-0 left-6 right-6 h-[2px] rounded-full bg-gradient-to-r from-primary/60 via-accent/40 to-transparent" />
          <Textarea
            placeholder="Ask a question or share your thoughts..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleSubmitComment)}
            className="resize-none min-h-[72px] border-0 bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary/30 text-sm"
            rows={3}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-muted-foreground">
              Ctrl+Enter to send
            </span>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground text-xs font-medium px-4"
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
        <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="space-y-1">
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No comments yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Be the first to start a discussion!
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {comments.map((comment, idx) => (
                <div key={comment.id}>
                  {/* Parent comment */}
                  <div className="py-3">
                    <div className="flex gap-3 group">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-teal-500 text-white text-xs font-semibold">
                          {getInitials(comment.author.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">
                            {comment.author.name || "Anonymous"}
                          </span>
                          {comment.author.role === "instructor" && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-0"
                            >
                              Instructor
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                          {comment.content}
                        </p>
                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                            onClick={() =>
                              setReplyingTo({
                                id: comment.id,
                                authorName:
                                  comment.author.name || "someone",
                              })
                            }
                          >
                            <Reply className="h-3 w-3 mr-1" />
                            Reply
                          </Button>
                          {comment.author.id === userId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(comment.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nested replies */}
                  {comment.replies.length > 0 && (
                    <div className="ml-8 pl-4 border-l-2 border-border/50 space-y-0">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="py-2">
                          <div className="flex gap-3 group">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-teal-500 text-white text-[10px] font-semibold">
                                {getInitials(reply.author.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-foreground">
                                  {reply.author.name || "Anonymous"}
                                </span>
                                {reply.author.role === "instructor" && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-0"
                                  >
                                    Instructor
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatRelativeTime(reply.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                                {reply.content}
                              </p>
                              <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {reply.author.id === userId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(reply.id)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
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
                    <div className="ml-8 pl-4 border-l-2 border-primary/30 py-2">
                      <div className="flex gap-3">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-teal-500 text-white text-[10px] font-bold">
                            ME
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 rounded-lg border bg-muted/30 p-2.5">
                          <Textarea
                            ref={replyTextareaRef}
                            placeholder={`Reply to ${replyingTo.authorName}...`}
                            value={replyContent}
                            onChange={(e) =>
                              setReplyContent(e.target.value)
                            }
                            onKeyDown={(e) =>
                              handleKeyDown(e, handleSubmitReply)
                            }
                            className="resize-none min-h-[44px] border-0 bg-transparent focus-visible:ring-0 text-sm p-0"
                            rows={2}
                          />
                          <div className="flex items-center justify-end gap-2 mt-1.5">
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
                              className="h-7 gap-1 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground text-xs px-3"
                              disabled={
                                !replyContent.trim() || submitting
                              }
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

                  {idx < comments.length - 1 && (
                    <Separator />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
