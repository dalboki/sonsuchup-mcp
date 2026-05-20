import { z, type ZodTypeAny } from 'zod';
import {
  callRpc,
  callRpcWith,
  allTokens,
  activeToken,
  getActiveIndex,
  setActiveIndex,
  tokenCount,
} from './supabase.js';

const WEB_URL = (process.env.SONSUCHUP_WEB_URL ?? 'https://sonsuchup.com').replace(
  /\/$/,
  '',
);
const caseUrl = (id: string) => `${WEB_URL}/cases/${id}`;
const listUrl = () => `${WEB_URL}/cases`;

type CaseData = {
  id?: string;
  caseInfo: {
    name: string;
    occurrence: string;
    occurrenceError: number;
    reportTime: string;
    location: string;
    summary: string;
  };
  timelineSettings: { mode: string; manualStart: string; manualEnd: string };
  people: PersonData[];
  edges: EdgeData[];
  customEvents: { id: number; name: string; time: string; note: string }[];
  records: RecordData[];
};

type PersonData = {
  id: number;
  gender: 'male' | 'female';
  x: number;
  y: number;
  name: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  roles: string[];
  note: string;
  deceased: boolean;
  deathTime: string;
  deathCause: string;
  notables: string[];
  alibis: AlibiData[];
};

type AlibiData = { start: string; end: string; content: string; status: string };
type EdgeData = { id: number; from: number; to: number; label: string };
type RecordData = { id: number; time: string; content: string; selected: boolean };

async function fetchCase(id: string): Promise<CaseData> {
  const data = await callRpc<CaseData | null>('mcp_get_case', { p_id: id });
  if (!data) throw new Error(`사건을 찾을 수 없습니다: ${id}`);
  return data;
}

async function saveCase(caseObj: CaseData): Promise<string> {
  return await callRpc<string>('mcp_save_case', { p_case: caseObj });
}

function nextLocalId(items: { id: number }[]): number {
  return items.reduce((max, it) => Math.max(max, it.id ?? 0), 0) + 1;
}

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Record<string, ZodTypeAny>>;
  handler: (args: any) => Promise<unknown>;
};

/** 토큰 → 계정 이메일 (세션 캐시). 실패 시 error 포함. */
const accountEmailCache = new Map<string, string | null>();
async function resolveAccount(
  token: string,
): Promise<{ email: string | null; error?: string }> {
  if (accountEmailCache.has(token)) {
    return { email: accountEmailCache.get(token) ?? null };
  }
  try {
    const r = await callRpcWith<{ userId: string; email: string | null }>(
      token,
      'mcp_whoami',
      {},
    );
    const email = r?.email ?? null;
    accountEmailCache.set(token, email);
    return { email };
  } catch (err) {
    return { email: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export const tools: ToolDef[] = [
  {
    name: 'whoami',
    description:
      '지금 활성화된 손수첩 계정(이메일)을 반환합니다. 사용자가 "지금 어느 계정에 연결돼 있어?", "이 MCP 계정이 뭐야?"라고 물으면 이 도구를 사용하세요.',
    inputSchema: z.object({}),
    handler: async () => {
      const acc = await resolveAccount(activeToken());
      if (acc.error) throw new Error(acc.error);
      return {
        email: acc.email,
        account: getActiveIndex() + 1,
        totalAccounts: tokenCount(),
      };
    },
  },
  {
    name: 'list_accounts',
    description:
      '이 MCP 서버에 설정된 모든 손수첩 계정의 이메일 목록을 반환합니다. 현재 활성 계정은 active=true로 표시됩니다. 여러 계정을 연결했을 때 어떤 계정들이 있는지 확인할 때 사용하세요.',
    inputSchema: z.object({}),
    handler: async () => {
      const tokens = allTokens();
      const accounts: Record<string, unknown>[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const acc = await resolveAccount(tokens[i]);
        accounts.push({
          account: i + 1,
          email: acc.email,
          active: i === getActiveIndex(),
          ...(acc.error ? { error: acc.error } : {}),
        });
      }
      return { totalAccounts: tokens.length, accounts };
    },
  },
  {
    name: 'use_account',
    description:
      '활성 손수첩 계정을 전환합니다. 사용자가 이메일을 지정하며 "이 계정으로 연결해줘 / 전환해줘"라고 하면 이 도구를 사용하세요. 전환 후의 모든 사건 도구 호출은 이 계정에 적용됩니다. 단, 전환하려는 계정은 미리 Claude Desktop 설정에 토큰(SONSUCHUP_TOKEN_2 등)으로 등록돼 있어야 합니다.',
    inputSchema: z.object({
      email: z.string().min(1).describe('전환할 계정의 이메일 주소'),
    }),
    handler: async ({ email }: { email: string }) => {
      const target = email.trim().toLowerCase();
      const tokens = allTokens();
      let matchIndex = -1;
      let matchEmail: string | null = null;
      const known: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const acc = await resolveAccount(tokens[i]);
        if (acc.email) {
          known.push(acc.email);
          if (acc.email.toLowerCase() === target) {
            matchIndex = i;
            matchEmail = acc.email;
          }
        }
      }
      if (matchIndex < 0) {
        throw new Error(
          `"${email}" 계정이 이 서버 설정에 없습니다. ` +
            `사용 가능한 계정: ${known.length ? known.join(', ') : '(없음)'}. ` +
            `새 계정을 쓰려면 손수첩 웹에서 토큰을 발급해 Claude Desktop 설정의 ` +
            `SONSUCHUP_TOKEN_2 등에 추가한 뒤 Claude Desktop을 재시작하세요.`,
        );
      }
      setActiveIndex(matchIndex);
      return { ok: true, active: matchEmail, account: matchIndex + 1 };
    },
  },
  {
    name: 'list_cases',
    description:
      '현재 사용자의 사건 목록(메타만)을 반환합니다. 각 항목은 id, name, occurrence, location, summary, 인물·기록 수와 함께 손수첩 웹에서 바로 열 수 있는 url을 포함합니다. 사용자에게 결과를 보여줄 때 각 사건의 url을 함께 노출하세요.',
    inputSchema: z.object({}),
    handler: async () => {
      const rows = (await callRpc<{ id: string }[]>('mcp_list_cases', {})) ?? [];
      return {
        listUrl: listUrl(),
        cases: rows.map((r) => ({ ...r, url: caseUrl(r.id) })),
      };
    },
  },
  {
    name: 'get_case_detail',
    description:
      '사건 한 건의 전체 내용(개요, 인물, 알리바이, 관계, 타임라인 이벤트, 기록)을 반환합니다. 결과의 url은 손수첩 웹에서 이 사건을 바로 여는 링크입니다.',
    inputSchema: z.object({ id: z.string().uuid().describe('사건의 UUID') }),
    handler: async ({ id }: { id: string }) => {
      const c = await fetchCase(id);
      return { ...c, url: caseUrl(c.id ?? id) };
    },
  },
  {
    name: 'create_case',
    description:
      '새 사건을 생성합니다. name은 필수, 나머지는 선택. 생성된 사건의 id(UUID)를 반환합니다.',
    inputSchema: z.object({
      name: z.string().min(1).describe('사건명'),
      occurrence: z
        .string()
        .optional()
        .describe('발생 시각, datetime-local 형식 (예: "2026-04-20T14:30")'),
      occurrenceError: z.number().int().min(0).optional().describe('발생 시각 오차(분)'),
      reportTime: z.string().optional().describe('신고/인지 시각'),
      location: z.string().optional().describe('발생 장소'),
      summary: z.string().optional().describe('사건 요약'),
    }),
    handler: async (input: {
      name: string;
      occurrence?: string;
      occurrenceError?: number;
      reportTime?: string;
      location?: string;
      summary?: string;
    }) => {
      const newCase: CaseData = {
        caseInfo: {
          name: input.name,
          occurrence: input.occurrence ?? '',
          occurrenceError: input.occurrenceError ?? 0,
          reportTime: input.reportTime ?? '',
          location: input.location ?? '',
          summary: input.summary ?? '',
        },
        timelineSettings: { mode: 'auto', manualStart: '', manualEnd: '' },
        people: [],
        edges: [],
        customEvents: [],
        records: [],
      };
      const id = await saveCase(newCase);
      return { id, url: caseUrl(id) };
    },
  },
  {
    name: 'update_case_info',
    description: '사건 개요의 일부 필드를 수정합니다. 전달한 필드만 변경됩니다.',
    inputSchema: z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      occurrence: z.string().optional(),
      occurrenceError: z.number().int().min(0).optional(),
      reportTime: z.string().optional(),
      location: z.string().optional(),
      summary: z.string().optional(),
    }),
    handler: async (input: Record<string, unknown>) => {
      const c = await fetchCase(input.id as string);
      const fields = [
        'name',
        'occurrence',
        'occurrenceError',
        'reportTime',
        'location',
        'summary',
      ] as const;
      for (const f of fields) {
        if (input[f] !== undefined) (c.caseInfo as Record<string, unknown>)[f] = input[f];
      }
      await saveCase(c);
      return { ok: true, url: caseUrl(input.id as string) };
    },
  },
  {
    name: 'add_person',
    description:
      '사건에 인물을 추가합니다. roles 예: ["피해자"], ["용의자"], ["참고인"], ["수사관"]. 추가된 인물의 local id를 반환합니다.',
    inputSchema: z.object({
      caseId: z.string().uuid(),
      name: z.string().min(1),
      gender: z.enum(['male', 'female']),
      roles: z.array(z.string()).optional(),
      birthYear: z.number().int().optional(),
      birthMonth: z.number().int().min(1).max(12).optional(),
      birthDay: z.number().int().min(1).max(31).optional(),
      note: z.string().optional().describe('인물 메모'),
      notables: z.array(z.string()).optional().describe('특이사항 항목들'),
      x: z.number().optional().describe('인물관계도 X 좌표 (기본 0)'),
      y: z.number().optional().describe('인물관계도 Y 좌표 (기본 0)'),
    }),
    handler: async (input: {
      caseId: string;
      name: string;
      gender: 'male' | 'female';
      roles?: string[];
      birthYear?: number;
      birthMonth?: number;
      birthDay?: number;
      note?: string;
      notables?: string[];
      x?: number;
      y?: number;
    }) => {
      const c = await fetchCase(input.caseId);
      const localId = nextLocalId(c.people);
      c.people.push({
        id: localId,
        name: input.name,
        gender: input.gender,
        x: Math.round(input.x ?? 0),
        y: Math.round(input.y ?? 0),
        birthYear: input.birthYear ?? null,
        birthMonth: input.birthMonth ?? null,
        birthDay: input.birthDay ?? null,
        roles: input.roles ?? [],
        note: input.note ?? '',
        deceased: false,
        deathTime: '',
        deathCause: '',
        notables: input.notables ?? [],
        alibis: [],
      });
      await saveCase(c);
      return { localId, url: caseUrl(input.caseId) };
    },
  },
  {
    name: 'add_alibi',
    description:
      '특정 인물에 알리바이를 추가합니다. status: claimed(주장)/confirmed(확인됨)/false(허위). 기본 claimed.',
    inputSchema: z.object({
      caseId: z.string().uuid(),
      personLocalId: z.number().int(),
      start: z.string().optional().describe('시작 시각 (datetime-local)'),
      end: z.string().optional().describe('종료 시각 (datetime-local)'),
      content: z.string().min(1).describe('알리바이 내용'),
      status: z.enum(['claimed', 'confirmed', 'false']).optional(),
    }),
    handler: async (input: {
      caseId: string;
      personLocalId: number;
      start?: string;
      end?: string;
      content: string;
      status?: 'claimed' | 'confirmed' | 'false';
    }) => {
      const c = await fetchCase(input.caseId);
      const person = c.people.find((p) => p.id === input.personLocalId);
      if (!person) throw new Error(`인물 local id ${input.personLocalId}을(를) 찾을 수 없습니다.`);
      person.alibis = person.alibis ?? [];
      person.alibis.push({
        start: input.start ?? '',
        end: input.end ?? '',
        content: input.content,
        status: input.status ?? 'claimed',
      });
      await saveCase(c);
      return { ok: true, url: caseUrl(input.caseId) };
    },
  },
  {
    name: 'add_record',
    description:
      '사건 기록을 추가합니다. time은 datetime-local 문자열 (예: "2026-04-20T14:30") 또는 생략(시간 미지정).',
    inputSchema: z.object({
      caseId: z.string().uuid(),
      time: z.string().optional(),
      content: z.string().min(1),
    }),
    handler: async (input: { caseId: string; time?: string; content: string }) => {
      const c = await fetchCase(input.caseId);
      const localId = nextLocalId(c.records);
      c.records.push({
        id: localId,
        time: input.time ?? '',
        content: input.content,
        selected: false,
      });
      await saveCase(c);
      return { localId, url: caseUrl(input.caseId) };
    },
  },
  {
    name: 'add_edge',
    description:
      '두 인물 사이 관계를 추가합니다. from/to는 인물의 local id. label 예: "친구", "직장 동료", "부부".',
    inputSchema: z.object({
      caseId: z.string().uuid(),
      from: z.number().int(),
      to: z.number().int(),
      label: z.string().optional(),
    }),
    handler: async (input: { caseId: string; from: number; to: number; label?: string }) => {
      const c = await fetchCase(input.caseId);
      const ids = new Set(c.people.map((p) => p.id));
      if (!ids.has(input.from)) throw new Error(`from 인물(${input.from})이 존재하지 않습니다.`);
      if (!ids.has(input.to)) throw new Error(`to 인물(${input.to})이 존재하지 않습니다.`);
      const localId = nextLocalId(c.edges);
      c.edges.push({
        id: localId,
        from: input.from,
        to: input.to,
        label: input.label ?? '',
      });
      await saveCase(c);
      return { localId, url: caseUrl(input.caseId) };
    },
  },
  {
    name: 'delete_case',
    description: '사건을 영구 삭제합니다. 인물·알리바이·기록 등 자식 데이터도 함께 삭제되며 되돌릴 수 없습니다.',
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async ({ id }: { id: string }) => {
      await callRpc<null>('mcp_delete_case', { p_id: id });
      return { ok: true, listUrl: listUrl() };
    },
  },
];
