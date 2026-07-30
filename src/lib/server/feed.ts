import "server-only";

import { isGenerationVisibleInFeed } from "@/lib/feed-visibility";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { FeedAuthor, FeedMediaKind, FeedPost, FeedReply, SharedFeedPost } from "@/lib/feed-types";

type FeedVisibilityRow = {
  media_kind: string | null;
  shared_post_id: string | null;
  source_asset_id: string | null;
};

function fail(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function mapAuthor(row: Record<string, unknown> | undefined): FeedAuthor {
  return {
    id: String(row?.id ?? "unknown"),
    name: String(row?.name ?? "Unknown creator"),
    handle: String(row?.handle ?? "@unknown"),
    avatarInitial: String(row?.avatar_initial ?? "?"),
    avatarHue: Number(row?.avatar_hue ?? 0),
    imageUrl: typeof row?.image_url === "string" ? row.image_url : null,
  };
}

export async function listFeedPosts(input: { viewerId?: string; postId?: string; limit?: number } = {}): Promise<FeedPost[]> {
  const supabase = getSupabaseAdminClient();
  let postsQuery = supabase
    .from("feed_posts")
    .select("id,author_id,body,media_kind,media_url,shared_post_id,series_id,episode_id,source_asset_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (input.postId) postsQuery = postsQuery.eq("id", input.postId);
  const postsResult = await postsQuery;
  fail(postsResult.error, "Load feed");
  const candidatePosts = postsResult.data ?? [];
  const candidateSharedIds = candidatePosts.map((post) => post.shared_post_id).filter((id): id is string => Boolean(id));
  const visibilitySharedResult = candidateSharedIds.length
    ? await supabase.from("feed_posts").select("id,media_kind,source_asset_id,shared_post_id").in("id", candidateSharedIds)
    : { data: [], error: null };
  fail(visibilitySharedResult.error, "Load shared feed visibility");
  const visibilityRows = [...candidatePosts, ...(visibilitySharedResult.data ?? [])];
  const sourceAssetIds = [...new Set(visibilityRows
    .map((post) => post.source_asset_id)
    .filter((id): id is string => Boolean(id)))];
  const [assetsResult, jobsResult] = sourceAssetIds.length
    ? await Promise.all([
      supabase.from("media_assets").select("id,kind,metadata").in("id", sourceAssetIds),
      supabase.from("generation_jobs").select("output_asset_id,video_type,metadata").in("output_asset_id", sourceAssetIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  fail(assetsResult.error, "Load feed asset kinds");
  fail(jobsResult.error, "Load feed generation kinds");
  const assets = new Map((assetsResult.data ?? []).map((asset) => [asset.id, asset]));
  const generationJobs = new Map((jobsResult.data ?? []).map((job) => [job.output_asset_id, job]));
  const sharedVisibilityRows = new Map((visibilitySharedResult.data ?? []).map((post) => [post.id, post]));
  const visible = (post: FeedVisibilityRow) => {
    const sourceAssetId = post.source_asset_id;
    const job = sourceAssetId ? generationJobs.get(sourceAssetId) : undefined;
    const asset = sourceAssetId ? assets.get(sourceAssetId) : undefined;
    return isGenerationVisibleInFeed({
      sourceAssetId,
      assetKind: asset?.kind,
      assetMetadata: asset?.metadata,
      mediaKind: post.media_kind,
      videoType: job?.video_type,
      jobMetadata: job?.metadata,
    });
  };
  const posts = candidatePosts
    .filter((post) => visible(post) && (!post.shared_post_id || visible(sharedVisibilityRows.get(post.shared_post_id) ?? post)))
    .slice(0, Math.min(100, Math.max(1, input.limit ?? 40)));
  if (!posts.length) return [];

  const postIds = posts.map((post) => post.id);
  const sharedIds = posts.map((post) => post.shared_post_id).filter((id): id is string => Boolean(id));
  const [repliesResult, reactionsResult, sharesResult, sharedResult] = await Promise.all([
    supabase.from("feed_replies").select("id,post_id,parent_reply_id,author_id,body,created_at").in("post_id", postIds).order("created_at"),
    supabase.from("feed_reactions").select("post_id,user_id").in("post_id", postIds),
    supabase.from("feed_posts").select("shared_post_id").in("shared_post_id", postIds),
    sharedIds.length
      ? supabase.from("feed_posts").select("id,author_id,body,media_kind,media_url,created_at").in("id", sharedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  fail(repliesResult.error, "Load feed replies");
  fail(reactionsResult.error, "Load feed reactions");
  fail(sharesResult.error, "Load feed shares");
  fail(sharedResult.error, "Load shared posts");

  const userIds = new Set<string>();
  for (const post of posts) userIds.add(post.author_id);
  for (const reply of repliesResult.data ?? []) userIds.add(reply.author_id);
  for (const shared of sharedResult.data ?? []) userIds.add(shared.author_id);
  const usersResult = await supabase.from("users").select("id,name,handle,avatar_initial,avatar_hue,image_url").in("id", [...userIds]);
  fail(usersResult.error, "Load feed creators");
  const users = new Map((usersResult.data ?? []).map((user) => [user.id, user as Record<string, unknown>]));

  const replies = new Map<string, FeedReply[]>();
  for (const row of repliesResult.data ?? []) {
    const list = replies.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      postId: row.post_id,
      parentReplyId: row.parent_reply_id,
      body: row.body,
      createdAt: row.created_at,
      author: mapAuthor(users.get(row.author_id)),
    });
    replies.set(row.post_id, list);
  }
  const reactionCounts = new Map<string, number>();
  const viewerLikes = new Set<string>();
  for (const reaction of reactionsResult.data ?? []) {
    reactionCounts.set(reaction.post_id, (reactionCounts.get(reaction.post_id) ?? 0) + 1);
    if (input.viewerId && reaction.user_id === input.viewerId) viewerLikes.add(reaction.post_id);
  }
  const shareCounts = new Map<string, number>();
  for (const share of sharesResult.data ?? []) {
    if (share.shared_post_id) shareCounts.set(share.shared_post_id, (shareCounts.get(share.shared_post_id) ?? 0) + 1);
  }
  const shared = new Map<string, SharedFeedPost>();
  for (const row of sharedResult.data ?? []) {
    shared.set(row.id, {
      id: row.id,
      body: row.body,
      mediaKind: row.media_kind as FeedMediaKind | null,
      mediaUrl: row.media_url,
      createdAt: row.created_at,
      author: mapAuthor(users.get(row.author_id)),
    });
  }

  return posts.map((row) => ({
    id: row.id,
    body: row.body,
    mediaKind: row.media_kind as FeedMediaKind | null,
    mediaUrl: row.media_url,
    sharedPostId: row.shared_post_id,
    seriesId: row.series_id,
    episodeId: row.episode_id,
    createdAt: row.created_at,
    author: mapAuthor(users.get(row.author_id)),
    replyCount: replies.get(row.id)?.length ?? 0,
    reactionCount: reactionCounts.get(row.id) ?? 0,
    shareCount: shareCounts.get(row.id) ?? 0,
    viewerHasLiked: viewerLikes.has(row.id),
    replies: replies.get(row.id) ?? [],
    sharedPost: row.shared_post_id ? shared.get(row.shared_post_id) ?? null : null,
  }));
}

export async function createFeedPost(input: {
  authorId: string;
  body?: string;
  mediaKind?: FeedMediaKind;
  mediaUrl?: string;
  sharedPostId?: string;
}) {
  const supabase = getSupabaseAdminClient();
  const result = await supabase.from("feed_posts").insert({
    author_id: input.authorId,
    body: input.body?.trim() ?? "",
    media_kind: input.mediaKind ?? null,
    media_url: input.mediaUrl ?? null,
    shared_post_id: input.sharedPostId ?? null,
  }).select("id").single();
  fail(result.error, "Publish feed post");
  return result.data?.id as string;
}

export async function createFeedReply(input: { postId: string; authorId: string; body: string; parentReplyId?: string }) {
  const result = await getSupabaseAdminClient().from("feed_replies").insert({
    post_id: input.postId,
    author_id: input.authorId,
    parent_reply_id: input.parentReplyId ?? null,
    body: input.body.trim(),
  }).select("id").single();
  fail(result.error, "Publish reply");
  return result.data?.id as string;
}

export async function toggleFeedReaction(input: { postId: string; userId: string }) {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase.from("feed_reactions").select("post_id").eq("post_id", input.postId).eq("user_id", input.userId).eq("kind", "like").maybeSingle();
  fail(existing.error, "Load reaction");
  if (existing.data) {
    const removed = await supabase.from("feed_reactions").delete().eq("post_id", input.postId).eq("user_id", input.userId).eq("kind", "like");
    fail(removed.error, "Remove reaction");
    return false;
  }
  const added = await supabase.from("feed_reactions").insert({ post_id: input.postId, user_id: input.userId, kind: "like" });
  fail(added.error, "Add reaction");
  return true;
}
