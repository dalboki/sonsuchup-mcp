# sonsuchup-mcp

[![npm version](https://img.shields.io/npm/v/sonsuchup-mcp.svg)](https://www.npmjs.com/package/sonsuchup-mcp)
[![license](https://img.shields.io/npm/l/sonsuchup-mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/sonsuchup-mcp.svg)](https://nodejs.org)

> **손수첩(Sonsuchup)** — 추리·사건 정리용 개인 웹 도구를 Claude Desktop, Cursor 등 MCP 클라이언트에 연결하는 stdio 서버.
> **Sonsuchup MCP server** — Stdio bridge that lets Claude Desktop, Cursor, and other MCP clients read and write your case-investigation data on https://sonsuchup.com.

---

## 🇰🇷 한국어

### 손수첩이 뭔가요?

[손수첩](https://sonsuchup.com)은 추리소설·미스터리·실제 사건을 정리하기 위한 개인 웹 도구입니다. 사건 개요, 인물관계도, 알리바이, 타임라인, 기록을 한 곳에서 다룰 수 있습니다. 이 MCP 서버는 그 데이터를 AI 도구로도 다룰 수 있게 해 줍니다.

### 시작하기 (30초)

#### 1. 토큰 발급
[손수첩 웹](https://sonsuchup.com) → 회원가입/로그인 → 우측 상단 **⚙ 설정** → **MCP 연결** → **새 토큰 발급**. 평문 토큰(`sonsu_mcp_...`)은 발급 직후 한 번만 표시되니 즉시 복사하세요.

#### 2. Claude Desktop에 등록

Claude Desktop 메뉴 → **Settings → Developer → Edit Config** 클릭. 열린 `claude_desktop_config.json`에 아래를 추가:

```json
{
  "mcpServers": {
    "sonsuchup": {
      "command": "npx",
      "args": ["-y", "sonsuchup-mcp"],
      "env": {
        "SONSUCHUP_TOKEN": "여기에-발급한-sonsu_mcp_xxx-붙여넣기"
      }
    }
  }
}
```

저장 후 Claude Desktop **완전 종료(Cmd+Q) → 재실행**.

#### 3. 사용

새 채팅에서:
```
sonsuchup MCP로 내 사건 목록 보여줘
"월광 호텔 401호 살인 사건"의 알리바이 모순을 찾아줘
"테스트 사건"을 만들고 인물 두 명을 추가해줘
```

### 제공 도구 (9개)

| 이름 | 용도 |
|---|---|
| `list_cases` | 내 사건 목록 (메타 + 손수첩 웹 링크 동봉) |
| `get_case_detail` | 사건 한 건의 전체 (인물·알리바이·관계·기록) |
| `create_case` | 새 사건 생성 |
| `update_case_info` | 사건 개요 부분 수정 |
| `add_person` | 인물 추가 |
| `add_alibi` | 인물에 알리바이 추가 |
| `add_record` | 사건 기록 추가 |
| `add_edge` | 인물 간 관계 추가 |
| `delete_case` | 사건 삭제 (되돌릴 수 없음) |

모든 응답에 손수첩 웹의 직접 링크(`url`)가 포함됩니다 — Claude가 답변에 클릭 가능한 링크로 인용합니다.

### 환경 변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `SONSUCHUP_TOKEN` | ✅ | 손수첩 웹에서 발급한 MCP 토큰 |
| `SONSUCHUP_WEB_URL` | ❌ | 응답 url의 베이스. 기본 `https://sonsuchup.com` |
| `SONSUCHUP_SUPABASE_URL` | ❌ | 기본값 = 손수첩 운영 인스턴스 |
| `SONSUCHUP_SUPABASE_ANON_KEY` | ❌ | 기본값 내장 (anon, 공개 정보) |

### 보안

- 토큰 평문은 **발급 직후 1회만** 표시됩니다. DB엔 sha256 해시만 저장됩니다.
- 분실 시 손수첩 웹에서 **폐기 → 재발급** 하세요.
- 패키지 안의 Supabase anon key는 공개돼도 안전합니다 (Row Level Security + MCP 토큰 검증으로 보호).
- 토큰은 **자신의 사건만** 접근할 수 있습니다 (RLS).

### 문제 해결

**Server disconnected / Could not attach to MCP server**
- 설정에서 `command`가 `npx`가 아니라 `node`로 잘못 들어갔는데 `args`에 스크립트 경로가 빠진 경우 자주 발생. `npx` 사용을 권장.
- 또는 Claude Desktop을 **창만 닫지 말고 Cmd+Q로 완전 종료** 후 재실행.

**MCP 토큰이 유효하지 않거나 폐기되었습니다**
- 손수첩 웹에서 새 토큰을 발급하고 config의 `SONSUCHUP_TOKEN`을 교체. Claude Desktop 재시작.

**도구가 안 보임 / 채팅이 커넥터 검색만 시도함**
- Claude Desktop의 **Settings → Developer → Local MCP Servers** 화면에서 sonsuchup 상태가 `running`인지 확인.
- `failed`면 "로그 보기" 또는 `tail ~/Library/Logs/Claude/mcp-server-sonsuchup.log`로 원인 확인.

**nvm 등으로 node 경로가 비표준일 때**
- npx로 실행하면 일반적으로 PATH 문제 없음. node 절대경로 방식이 필요하면 `which node` 결과를 `command` 값으로 사용.

### 로컬 개발

```bash
git clone https://github.com/dalboki/sonsuchup-mcp.git
cd sonsuchup-mcp
npm install
npm run build
SONSUCHUP_TOKEN=... node dist/index.js   # stdio 대기 상태면 정상 (Ctrl+C 종료)
```

Claude Desktop에서 publish 전 버전 테스트하려면:
```json
{
  "mcpServers": {
    "sonsuchup": {
      "command": "node",
      "args": ["/절대/경로/sonsuchup-mcp/dist/index.js"],
      "env": { "SONSUCHUP_TOKEN": "..." }
    }
  }
}
```

---

## 🇺🇸 English

### What is Sonsuchup?

[Sonsuchup](https://sonsuchup.com) (손수첩, "hand notebook") is a personal web tool for organizing detective fiction, mysteries, and real-life cases — overview, people graph, alibis, timeline, and field notes in one place. This MCP server exposes that data to AI assistants.

### Quick start

#### 1. Issue a token
On [sonsuchup.com](https://sonsuchup.com), sign up / log in → ⚙ Settings → **MCP 연결** → **새 토큰 발급**. The plaintext token (`sonsu_mcp_...`) is shown **once** — copy it immediately.

#### 2. Register with Claude Desktop
Claude Desktop → Settings → Developer → Edit Config → add:

```json
{
  "mcpServers": {
    "sonsuchup": {
      "command": "npx",
      "args": ["-y", "sonsuchup-mcp"],
      "env": {
        "SONSUCHUP_TOKEN": "paste-your-sonsu_mcp_xxx-here"
      }
    }
  }
}
```

Save and **fully quit** Claude Desktop (Cmd+Q), then reopen.

#### 3. Use it
In a new chat:
```
Show my Sonsuchup cases via MCP
Find alibi contradictions in the "Moonlight Hotel Room 401" murder case
Create a test case and add two people to it
```

### Tools (9)

| Name | Purpose |
|---|---|
| `list_cases` | List my cases (meta + direct web links) |
| `get_case_detail` | Full case content (people, alibis, edges, records) |
| `create_case` | Create a new case |
| `update_case_info` | Patch a case's overview fields |
| `add_person` | Add a person |
| `add_alibi` | Add an alibi to a person |
| `add_record` | Add a case record |
| `add_edge` | Add a relationship between two people |
| `delete_case` | Delete a case (irreversible) |

Every response includes a `url` to the case page in the Sonsuchup web app so the model can cite a clickable link.

### Environment variables

| Name | Required | Description |
|---|---|---|
| `SONSUCHUP_TOKEN` | ✅ | MCP token issued from the Sonsuchup web app |
| `SONSUCHUP_WEB_URL` | ❌ | Base URL used in response `url` fields. Default `https://sonsuchup.com` |
| `SONSUCHUP_SUPABASE_URL` | ❌ | Defaults to the production Sonsuchup instance |
| `SONSUCHUP_SUPABASE_ANON_KEY` | ❌ | Built-in default (anon, publishable) |

### Security model

- Plaintext token is shown **once** at issue time. Only a sha256 hash is stored server-side.
- Lost a token? Revoke it on the web and issue a new one.
- The embedded Supabase anon key is safe to publish — protected by Postgres RLS and MCP token verification.
- A token can only access **its owner's cases** (enforced by RLS).

### Local development

```bash
git clone https://github.com/dalboki/sonsuchup-mcp.git
cd sonsuchup-mcp
npm install
npm run build
SONSUCHUP_TOKEN=... node dist/index.js   # Stdio waiting = healthy (Ctrl+C to exit)
```

To test a pre-publish build in Claude Desktop, point `command` to `node` and `args` to the absolute path of `dist/index.js`.

---

## License

[MIT](./LICENSE) © dalboki
