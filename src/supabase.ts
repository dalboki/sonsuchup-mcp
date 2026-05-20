import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SONSUCHUP_SUPABASE_URL ?? 'https://xpggpipeaxhimjquxyyx.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SONSUCHUP_SUPABASE_ANON_KEY ?? 'sb_publishable_RQNCL_uZrzzXALN868N-Gw_zByi4pRb';

/**
 * 설정에서 MCP 토큰을 모두 읽는다.
 * - SONSUCHUP_TOKEN        : 1번(기본) 계정
 * - SONSUCHUP_TOKEN_2..20  : 추가 계정
 * 단일 토큰 설정도 그대로 동작한다 (하위 호환).
 */
function loadTokens(): string[] {
  const out: string[] = [];
  const first = (process.env.SONSUCHUP_TOKEN ?? '').trim();
  if (first) out.push(first);
  for (let i = 2; i <= 20; i++) {
    const t = (process.env[`SONSUCHUP_TOKEN_${i}`] ?? '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

const TOKENS = loadTokens();

if (TOKENS.length === 0) {
  process.stderr.write(
    '[sonsuchup-mcp] SONSUCHUP_TOKEN 환경 변수가 필요합니다.\n' +
      '손수첩 웹(https://sonsuchup.com) → 설정 → MCP 연결에서 발급하세요.\n' +
      '여러 계정을 연결하려면 SONSUCHUP_TOKEN_2, SONSUCHUP_TOKEN_3 ... 을 추가하세요.\n',
  );
  process.exit(1);
}

/** 현재 활성 계정 인덱스 (기본: 첫 번째 토큰). use_account 도구로 변경된다. */
let activeIndex = 0;

/** 설정된 계정(토큰) 개수 */
export function tokenCount(): number {
  return TOKENS.length;
}

/** 현재 활성 계정의 토큰 */
export function activeToken(): string {
  return TOKENS[activeIndex];
}

/** 현재 활성 계정 인덱스 (0-based) */
export function getActiveIndex(): number {
  return activeIndex;
}

/** 설정된 모든 토큰 (읽기 전용) */
export function allTokens(): readonly string[] {
  return TOKENS;
}

/** 활성 계정을 전환한다 */
export function setActiveIndex(i: number): void {
  if (i < 0 || i >= TOKENS.length) {
    throw new Error(`잘못된 계정 인덱스: ${i + 1} (설정된 계정 ${TOKENS.length}개)`);
  }
  activeIndex = i;
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 지정한 토큰으로 RPC 호출 */
export async function callRpcWith<T = unknown>(
  token: string,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, { p_token: token, ...args });
  if (error) {
    const msg = error.message || 'unknown error';
    if (/invalid or revoked MCP token/i.test(msg)) {
      throw new Error('MCP 토큰이 유효하지 않거나 폐기되었습니다. 손수첩 설정에서 새 토큰을 발급하세요.');
    }
    throw new Error(`Supabase RPC ${fn} 실패: ${msg}`);
  }
  return data as T;
}

/** 현재 활성 계정 토큰으로 RPC 호출 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return callRpcWith<T>(activeToken(), fn, args);
}
