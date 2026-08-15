export function demoUserFromCookie(cookie: string | null) {
  const match = cookie?.match(/(?:^|;\s*)growthos_demo_user=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "user-owner";
}
