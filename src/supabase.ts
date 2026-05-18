import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SONSUCHUP_SUPABASE_URL ?? 'https://xpggpipeaxhimjquxyyx.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SONSUCHUP_SUPABASE_ANON_KEY ?? 'sb_publishable_RQNCL_uZrzzXALN868N-Gw_zByi4pRb';

export const TOKEN = process.env.SONSUCHUP_TOKEN ?? '';

if (!TOKEN) {
  process.stderr.write(
    '[sonsuchup-mcp] SONSUCHUP_TOKEN 환경 변수가 필요합니다.\n' +
      '손수첩 웹(https://sonsuchup.com) → 설정 → MCP 연결에서 발급하세요.\n',
  );
  process.exit(1);
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, { p_token: TOKEN, ...args });
  if (error) {
    const msg = error.message || 'unknown error';
    if (/invalid or revoked MCP token/i.test(msg)) {
      throw new Error('MCP 토큰이 유효하지 않거나 폐기되었습니다. 손수첩 설정에서 새 토큰을 발급하세요.');
    }
    throw new Error(`Supabase RPC ${fn} 실패: ${msg}`);
  }
  return data as T;
}
