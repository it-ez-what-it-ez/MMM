import "server-only";

import type { MetricSnapshot, ProviderKey } from "@/lib/v1/domain";
import type {
  OrganicPublisherAdapter,
  OrganicPublishInput,
  ProviderAccountContext,
  ProviderValidation,
} from "./contracts";

type Json = Record<string, unknown>;
async function request(url: string, init: RequestInit, label: string) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) {
    const error = payload.error as Json | undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : typeof payload.message === "string"
          ? payload.message
          : `${label} returned ${response.status}.`,
    );
  }
  const providerError = payload.error as Json | undefined;
  if (
    providerError?.code !== undefined &&
    ![0, "0", "ok"].includes(providerError.code as string | number)
  )
    throw new Error(
      typeof providerError.message === "string"
        ? providerError.message
        : `${label} rejected the request.`,
    );
  return {
    payload,
    requestId: response.headers.get("x-request-id") ?? undefined,
    resourceId:
      response.headers.get("x-restli-id") ??
      response.headers.get("x-linkedin-id") ??
      undefined,
  };
}
function validateBase(input: OrganicPublishInput): ProviderValidation {
  const errors: ProviderValidation["errors"] = [];
  if (!input.text.trim())
    errors.push({
      code: "text_required",
      field: "text",
      message: "Post text is required.",
    });
  if (!input.mediaUrls.length)
    errors.push({
      code: "image_required",
      field: "media",
      message: "V1 organic publishing requires a real image.",
    });
  for (const url of input.mediaUrls)
    try {
      new URL(url);
    } catch {
      errors.push({
        code: "invalid_media_url",
        field: "media",
        message: "Provider media URL is invalid.",
      });
    }
  return { valid: errors.length === 0, errors };
}
function emptyMetrics(): MetricSnapshot[] {
  return [];
}

export class MetaOrganicAdapter implements OrganicPublisherAdapter {
  readonly provider = "meta_business" as const;
  async validate(context: ProviderAccountContext, input: OrganicPublishInput) {
    const result = validateBase(input);
    if (
      !["facebook_page", "instagram_professional"].includes(
        context.account.accountType,
      )
    )
      result.errors.push({
        code: "wrong_account",
        message: "Choose a Facebook Page or Instagram professional account.",
      });
    result.valid = result.errors.length === 0;
    return result;
  }
  private token(context: ProviderAccountContext) {
    return String(context.secrets.pageAccessToken ?? context.accessToken);
  }
  async publish(context: ProviderAccountContext, input: OrganicPublishInput) {
    const version = process.env.META_GRAPH_VERSION || "v24.0";
    const token = this.token(context);
    if (context.account.accountType === "facebook_page") {
      if (input.mediaUrls.length > 1) {
        const mediaIds: string[] = [];
        for (const url of input.mediaUrls) {
          const upload = new URLSearchParams({
            url,
            published: "false",
            access_token: token,
          });
          const uploaded = await request(
            `https://graph.facebook.com/${version}/${context.account.externalId}/photos`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: upload,
            },
            "Facebook",
          );
          const mediaId = String(uploaded.payload.id ?? "");
          if (!mediaId)
            throw new Error("Facebook did not return a carousel image ID.");
          mediaIds.push(mediaId);
        }
        const feed = new URLSearchParams({
          message: input.text,
          attached_media: JSON.stringify(
            mediaIds.map((media_fbid) => ({ media_fbid })),
          ),
          access_token: token,
        });
        const result = await request(
          `https://graph.facebook.com/${version}/${context.account.externalId}/feed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: feed,
          },
          "Facebook",
        );
        return {
          externalPostId: String(result.payload.id),
          status: "published",
          providerRequestId: result.requestId,
        };
      }
      const params = new URLSearchParams({
        url: input.mediaUrls[0],
        caption: input.text,
        published: "true",
        access_token: token,
      });
      const result = await request(
        `https://graph.facebook.com/${version}/${context.account.externalId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        },
        "Facebook",
      );
      return {
        externalPostId: String(result.payload.post_id ?? result.payload.id),
        status: "published",
        providerRequestId: result.requestId,
      };
    }
    const creationIds: string[] = [];
    for (const [index, url] of input.mediaUrls.entries()) {
      const params = new URLSearchParams({
        image_url: url,
        is_carousel_item: input.mediaUrls.length > 1 ? "true" : "false",
        access_token: token,
      });
      if (input.mediaUrls.length === 1) params.set("caption", input.text);
      const result = await request(
        `https://graph.facebook.com/${version}/${context.account.externalId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        },
        "Instagram",
      );
      const id = String(result.payload.id);
      if (!id)
        throw new Error(
          `Instagram did not create media container ${index + 1}.`,
        );
      creationIds.push(id);
    }
    let containerId = creationIds[0];
    if (creationIds.length > 1) {
      const params = new URLSearchParams({
        media_type: "CAROUSEL",
        children: creationIds.join(","),
        caption: input.text,
        access_token: token,
      });
      const result = await request(
        `https://graph.facebook.com/${version}/${context.account.externalId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        },
        "Instagram",
      );
      containerId = String(result.payload.id);
    }
    const publish = new URLSearchParams({
      creation_id: containerId,
      access_token: token,
    });
    const result = await request(
      `https://graph.facebook.com/${version}/${context.account.externalId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: publish,
      },
      "Instagram",
    );
    return {
      externalPostId: String(result.payload.id ?? result.resourceId),
      status: "published",
      providerRequestId: result.requestId,
    };
  }
  async status(context: ProviderAccountContext, externalPostId: string) {
    const version = process.env.META_GRAPH_VERSION || "v24.0";
    return (
      await request(
        `https://graph.facebook.com/${version}/${externalPostId}?fields=id,permalink_url,timestamp&access_token=${encodeURIComponent(this.token(context))}`,
        {},
        "Meta",
      )
    ).payload;
  }
  async metrics(
    context: ProviderAccountContext,
    externalPostId: string,
  ): Promise<MetricSnapshot[]> {
    const version = process.env.META_GRAPH_VERSION || "v24.0";
    const token = encodeURIComponent(this.token(context));
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    if (context.account.accountType === "instagram_professional") {
      const [insights, object] = await Promise.all([
        request(
          `https://graph.facebook.com/${version}/${externalPostId}/insights?metric=reach,saved,shares,total_interactions&access_token=${token}`,
          {},
          "Instagram insights",
        ),
        request(
          `https://graph.facebook.com/${version}/${externalPostId}?fields=like_count,comments_count&access_token=${token}`,
          {},
          "Instagram insights",
        ),
      ]);
      const values = Object.fromEntries(
        ((insights.payload.data as Json[] | undefined) ?? []).map((row) => [
          String(row.name),
          Number(((row.values as Json[] | undefined) ?? [])[0]?.value ?? 0),
        ]),
      );
      return [
        {
          provider: "meta_business",
          sourceModel: "Instagram media insights",
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          currency: null,
          metrics: {
            ...values,
            likes: Number(object.payload.like_count ?? 0),
            comments: Number(object.payload.comments_count ?? 0),
          },
        },
      ];
    }
    const report = await request(
      `https://graph.facebook.com/${version}/${externalPostId}/insights?metric=post_impressions,post_clicks,post_engaged_users&access_token=${token}`,
      {},
      "Facebook insights",
    );
    const metrics = Object.fromEntries(
      ((report.payload.data as Json[] | undefined) ?? []).map((row) => [
        String(row.name),
        Number(((row.values as Json[] | undefined) ?? [])[0]?.value ?? 0),
      ]),
    );
    return [
      {
        provider: "meta_business",
        sourceModel: "Facebook Page post insights",
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        currency: null,
        metrics,
      },
    ];
  }
}

export class TikTokOrganicAdapter implements OrganicPublisherAdapter {
  readonly provider = "tiktok_organic" as const;
  async validate(context: ProviderAccountContext, input: OrganicPublishInput) {
    const result = validateBase(input);
    if (!input.privacy)
      result.errors.push({
        code: "privacy_required",
        field: "privacy",
        message: "Choose one of the creator's current privacy options.",
      });
    const creatorResult = await request(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: "{}",
      },
      "TikTok",
    );
    const creator =
      (creatorResult.payload.data as Json | undefined) ?? creatorResult.payload;
    const privacyOptions =
      (creator.privacy_level_options as string[] | undefined) ?? [];
    if (input.privacy && !privacyOptions.includes(input.privacy))
      result.errors.push({
        code: "privacy_unavailable",
        field: "privacy",
        message:
          "The selected TikTok privacy option is no longer available. Review this post again.",
      });
    if (input.commentsEnabled && creator.comment_disabled === true)
      result.errors.push({
        code: "comments_unavailable",
        field: "commentsEnabled",
        message: "Comments are currently disabled for this TikTok creator.",
      });
    result.valid = result.errors.length === 0;
    result.normalized = {
      privacyOptions,
      commentsDisabled: creator.comment_disabled === true,
    };
    return result;
  }
  async publish(context: ProviderAccountContext, input: OrganicPublishInput) {
    const result = await request(
      "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: input.title ?? input.text.slice(0, 90),
            description: input.text,
            privacy_level: input.privacy,
            disable_comment: input.commentsEnabled === false,
            auto_add_music: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: input.mediaUrls,
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
        }),
      },
      "TikTok",
    );
    const data = (result.payload.data as Json | undefined) ?? result.payload;
    return {
      externalPostId: String(data.publish_id),
      status: "processing",
      providerRequestId: result.requestId,
    };
  }
  async status(context: ProviderAccountContext, externalPostId: string) {
    return (
      await request(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${context.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ publish_id: externalPostId }),
        },
        "TikTok",
      )
    ).payload;
  }
  async metrics(context: ProviderAccountContext, externalPostId: string) {
    const result = await request(
      "https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ filters: { video_ids: [externalPostId] } }),
      },
      "TikTok Display API",
    );
    const data = (result.payload.data as Json | undefined) ?? {};
    const row = ((data.videos as Json[] | undefined) ?? [])[0];
    if (!row) return emptyMetrics();
    const end = new Date();
    return [
      {
        provider: "tiktok_organic" as const,
        sourceModel: "TikTok public post engagement",
        periodStart: new Date(end.getTime() - 7 * 86400000).toISOString(),
        periodEnd: end.toISOString(),
        currency: null,
        metrics: {
          views: Number(row.view_count ?? 0),
          likes: Number(row.like_count ?? 0),
          comments: Number(row.comment_count ?? 0),
          shares: Number(row.share_count ?? 0),
        },
      },
    ];
  }
}

export class LinkedInOrganicAdapter implements OrganicPublisherAdapter {
  readonly provider = "linkedin_pages" as const;
  private headers(context: ProviderAccountContext) {
    return {
      Authorization: `Bearer ${context.accessToken}`,
      "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202602",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    };
  }
  async validate(_context: ProviderAccountContext, input: OrganicPublishInput) {
    return validateBase(input);
  }
  async publish(context: ProviderAccountContext, input: OrganicPublishInput) {
    const owner = `urn:li:organization:${context.account.externalId}`;
    const mediaUrns: string[] = [];
    for (const mediaUrl of input.mediaUrls) {
      const init = await request(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        {
          method: "POST",
          headers: this.headers(context),
          body: JSON.stringify({ initializeUploadRequest: { owner } }),
        },
        "LinkedIn",
      );
      const value = (init.payload.value as Json | undefined) ?? init.payload;
      const uploadUrl = String(value.uploadUrl);
      const image = String(value.image);
      const bytes = await fetch(mediaUrl).then(async (response) => {
        if (!response.ok) throw new Error("LinkedIn media could not be read.");
        return response.arrayBuffer();
      });
      const uploaded = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${context.accessToken}` },
        body: bytes,
      });
      if (!uploaded.ok)
        throw new Error(`LinkedIn image upload returned ${uploaded.status}.`);
      mediaUrns.push(image);
    }
    const content = mediaUrns.length
      ? { media: { title: input.title ?? "Campaign image", id: mediaUrns[0] } }
      : {
          article: {
            source: input.destinationUrl,
            title: input.title ?? input.text.slice(0, 100),
          },
        };
    const result = await request(
      "https://api.linkedin.com/rest/posts",
      {
        method: "POST",
        headers: this.headers(context),
        body: JSON.stringify({
          author: owner,
          commentary: input.text,
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          content,
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      },
      "LinkedIn",
    );
    return {
      externalPostId: String(result.payload.id ?? result.resourceId),
      status: "published",
      providerRequestId: result.requestId,
    };
  }
  async status(context: ProviderAccountContext, externalPostId: string) {
    return (
      await request(
        `https://api.linkedin.com/rest/posts/${encodeURIComponent(externalPostId)}`,
        { headers: this.headers(context) },
        "LinkedIn",
      )
    ).payload;
  }
  async metrics(context: ProviderAccountContext, externalPostId: string) {
    const query = new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: `urn:li:organization:${context.account.externalId}`,
      shares: `List(${externalPostId})`,
    });
    const result = await request(
      `https://api.linkedin.com/rest/organizationalEntityShareStatistics?${query}`,
      { headers: this.headers(context) },
      "LinkedIn organization statistics",
    );
    const element =
      ((result.payload.elements as Json[] | undefined) ?? [])[0] ?? {};
    const values = (element.totalShareStatistics as Json | undefined) ?? {};
    const end = new Date();
    return [
      {
        provider: "linkedin_pages" as const,
        sourceModel: "LinkedIn organization share statistics",
        periodStart: new Date(end.getTime() - 7 * 86400000).toISOString(),
        periodEnd: end.toISOString(),
        currency: null,
        metrics: {
          impressions: Number(values.impressionCount ?? 0),
          uniqueImpressions: Number(values.uniqueImpressionsCount ?? 0),
          clicks: Number(values.clickCount ?? 0),
          likes: Number(values.likeCount ?? 0),
          comments: Number(values.commentCount ?? 0),
          shares: Number(values.shareCount ?? 0),
        },
      },
    ];
  }
}

export function organicAdapter(provider: ProviderKey): OrganicPublisherAdapter {
  if (provider === "meta_business") return new MetaOrganicAdapter();
  if (provider === "tiktok_organic") return new TikTokOrganicAdapter();
  if (provider === "linkedin_pages") return new LinkedInOrganicAdapter();
  throw new Error(`${provider} is not a V1 organic publishing provider.`);
}
