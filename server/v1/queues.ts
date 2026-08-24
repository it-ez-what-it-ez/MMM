import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ORGANIC_QUEUE = "organic_publishing";

export type QueueMessage = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Record<string, unknown>;
};

export async function enqueueOrganicPublish(
  publishJobId: string,
  runAfter: string,
) {
  const delaySeconds = Math.max(
    0,
    Math.ceil((new Date(runAfter).getTime() - Date.now()) / 1000),
  );
  const { data, error } = await getSupabaseAdmin()
    .schema("private")
    .rpc("queue_send", {
      target_queue: ORGANIC_QUEUE,
      payload: { publishJobId },
      delay_seconds: delaySeconds,
    });
  if (error) throw error;
  return data as number;
}

export async function readOrganicPublishQueue(quantity = 20) {
  const { data, error } = await getSupabaseAdmin()
    .schema("private")
    .rpc("queue_read", {
      target_queue: ORGANIC_QUEUE,
      visibility_seconds: 120,
      quantity,
    });
  if (error) throw error;
  return (data ?? []) as QueueMessage[];
}

export async function deleteOrganicQueueMessage(messageId: number) {
  const { error } = await getSupabaseAdmin()
    .schema("private")
    .rpc("queue_delete", {
      target_queue: ORGANIC_QUEUE,
      target_message_id: messageId,
    });
  if (error) throw error;
}
