# SillyTavern Macro Compatibility (Marinara Engine 확장)

SillyTavern 프리셋에 들어 있는 매크로를 Marinara Engine 문법으로 바꿔 주는 Marinara 확장이에요.
Marinara는 SillyTavern 프리셋을 가져올 때 매크로를 그대로 두기 때문에, 아래 같은 글이 모델에 **글자 그대로** 전달돼요.

```
{{.main_statements = on}}{{#if !.macro_cleaner}}{{.order_error_core = on}}{{/if}}{{trim}}
```

이 확장은 같은 동작을 하는 Marinara 문법으로 바꿔요.

```
{{setvar::main_statements::on}}{{#if var.macro_cleaner}}{{else}}{{setvar::order_error_core::on}}{{/if}}{{trimEnd}}{{trimStart}}
```

`{{lastMessage}}`처럼 Marinara에 아예 없는 매크로는, 확장이 **생성 직전에** 값을 계산해 채팅 변수(`st_`로 시작)에 넣어 줘요.

## 설치

1. Marinara 서버의 `.env`에 `ENABLE_EXTERNAL_EXTENSIONS=true`를 넣고 Marinara를 다시 켜요.
2. **Settings → Advanced → Danger Zone**에서 **Allow third-party extension imports**를 켜요.
3. **Settings → Addons → External Extensions**에서 둘 중 하나로 가져와요.
   - **Import Extension Folder**: `release/SillyTavern Macro Compatibility` 폴더를 고르기
   - **Import Extension File**: 그 폴더를 ZIP으로 묶은 파일 고르기
4. 목록에서 확장을 누르고 **Enable → Run Exact Code**로 승인해요.

이 확장은 **전체 페이지 접근(Full page access)** 권한이 필요해요. 프리셋을 읽고 고쳐야 하고, 생성 요청 직전에 값을 채워야 하기 때문이에요. 코드는 `release/.../extension.js` 한 파일이니 승인하기 전에 열어 볼 수 있어요.

휴대폰이나 다른 기기에서 Marinara에 접속한다면, Marinara 안내대로 `ADMIN_SECRET`도 설정해야 확장을 가져올 수 있어요.

## 사용법

화면 오른쪽 가장자리의 **ST 매크로** 탭을 누르면 창이 열려요. 탭은 끌어서 옮길 수 있어요.

- **프리셋 변환**: 프리셋을 고르고 **검사하기**를 누르면, 바뀌는 섹션과 바뀐 내용, 주의할 점을 보여 줘요.
  - **변환한 사본 만들기**: `원래 이름 (Marinara 매크로)`라는 새 프리셋을 만들어요. 채팅 설정에서 이 프리셋을 고르면 돼요.
  - **원본에 바로 적용**: 원래 프리셋을 그대로 고쳐요.
  - 변환한 섹션 맨 앞에는 `{{// ST→Marinara}}` 주석이 붙어요. Marinara는 주석을 모델에 보내지 않아요. 이 표시가 있으면 다시 변환하지 않아서, 두 번 눌러도 안전해요.
- **텍스트 변환**: 로어북 항목이나 캐릭터 카드처럼 프리셋 밖의 글을 붙여 넣어 바꿔요. **복사** 버튼으로 가져가면 그 글이 쓰는 `st_` 값도 모든 채팅에서 채워져요.
- **값 채우기**: 생성 직전 값 채우기를 켜고 끄고, 저장된 전역 변수(`$이름`)를 확인하거나 지워요.

## 무엇이 어떻게 바뀌나요

| SillyTavern | Marinara | 비고 |
|---|---|---|
| `{{.x}}`, `{{.x = 값}}`, `{{.x += 값}}`, `{{.x -= 3}}` | `getvar` / `setvar` / `addvar` / `addnumvar` | |
| `{{.x++}}`, `{{.x--}}`, `{{incvar::x}}` | `{{addvar::x::1}}{{getvar::x}}` | 글자에 1을 붙이는 SillyTavern 동작까지 같아요 |
| `{{.x \|\| 기본값}}`, `??`, `\|\|=`, `??=` | `{{#if var.x}}…{{else}}…{{/if}}` | |
| `{{.x == 값}}`, `!=`, `>`, `>=`, `<`, `<=` | `{{#if var.x == "값"}}true{{else}}false{{/if}}` | |
| `{{$x}}` 전역 변수, `getglobalvar` 등 | `stg_x` 채팅 변수 | 확장이 모든 채팅에 이어 줘요 |
| `{{if .x}}`, `{{if !.x}}`, `{{#if …}}`, `{{else}}` | `{{#if var.x}}`, 거짓일 때는 분기를 바꿔요 | |
| `{{if {{.x == 값}}}}` | `{{#if var.x == "값"}}` | |
| `{{if description}}` 같은 매크로 이름 조건 | `{{#if description}}` 등 | |
| `{{setvar::x}}내용{{/setvar}}` 같은 블록 매크로 | `{{setvar::x::내용}}` | 앞뒤 공백·들여쓰기 정리도 같아요 |
| `{{hasvar::x}}`, `{{deletevar::x}}` | `{{#if var.x != ""}}…`, `{{setvar::x::}}` | |
| `{{trim}}`, `{{trim}}…{{/trim}}` | `{{trimEnd}}{{trimStart}}`, `{{trimStart}}…{{trimEnd}}` | |
| `{{// 주석}}`, `{{//}}…{{///}}` | `{{// 주석}}` | |
| `{{roll::2d6+3}}` | 주사위 + 덧셈 | |
| `{{random:a,b}}`, `{{random::a::b}}` | `{{random::a::b}}` | |
| `{{pick::a::b}}` | 채팅마다 한 번 고른 값을 변수에 저장 | |
| `{{charDescription}}`, `{{charPrompt}}`, `{{mesExamples}}`, `{{persona}}` … | `{{description}}`, `{{charSysInfo}}`, `{{example}}`, `{{personaDescription}}` … | |
| `{{group}}`, `{{notChar}}` | `{{char}}`·`{{group}}` 조합 | Marinara의 `group`은 응답 캐릭터를 뺀 목록이라 맞춰 써요 |
| `{{isodate}}`, `{{isotime}}`, `{{idleDuration}}` | `{{date}}`, `{{time}}`, `{{idle_duration}}` | |
| `{{lastMessage}}`, `{{lastUserMessage}}`, `{{lastCharMessage}}`, `{{lastMessageId}}`, `{{lastSwipeId}}`, `{{currentSwipeId}}`, `{{allChatRange}}` | 생성 직전에 채우는 `st_` 변수 | |
| `{{charVersion}}`, `{{charCreatorNotes}}`, `{{charDepthPrompt}}`, `{{charFirstMessage::n}}` | 생성 직전에 채우는 `st_` 변수 | |
| `{{maxContext}}`, `{{maxPrompt}}`, `{{maxResponse}}`, `{{isMobile}}`, `{{time::UTC+9}}`, `{{datetimeformat::…}}` | 생성 직전에 채우는 `st_` 변수 | |
| `<USER>`, `<BOT>`, `{{time_UTC+9}}` 같은 옛 표기 | 새 표기로 바꾼 뒤 변환 | |

### 비슷하게만 되거나 안 되는 것

변환 화면의 **안내**에 섹션별로 표시돼요.

- **참/거짓 판정**: Marinara는 값이 `no`, `null`, `undefined`일 때도 거짓으로 봐요. SillyTavern은 빈 값, `off`, `false`, `0`만 거짓이에요.
- **비교**: Marinara의 `==`, `!=`는 대소문자를 구분하지 않고, 숫자는 숫자로 비교해요(`1.0 == 1`).
- **빈 문자열 변수**: Marinara는 "빈 값으로 정해 둔 변수"와 "없는 변수"를 구분하지 못해요(`hasvar`, `??`).
- **이름이 매크로로 만들어지는 변수**(`{{setvar::{{char}}_mood::…}}`)는 Marinara에서 동작하지 않아요.
- **지원 안 됨(지워요)**: 매크로로 만든 값을 뒤집는 `{{reverse}}`, `{{timeDiff}}`, JSON 안의 값을 다루는 `setvarkey`/`getvarkey`, `{{hasExtension}}`(항상 `false`).
- **텍스트 완성 전용 설정**: Instruct/시스템 프롬프트 매크로는 비워요. `{{exampleSeparator}}`, `{{chatStart}}`는 SillyTavern 기본값으로 바꿔요.
- **형식 차이**: `{{date}}`, `{{time}}`은 Marinara 형식(YYYY-MM-DD, 24시간)이에요. `{{input}}`은 마지막 사용자 메시지예요.
- **값 채우기 범위**: `st_` 값은 Marinara 화면에서 보낸 생성에만 채워져요. 서버가 스스로 시작하는 생성(에이전트 등)에서는 이전 값이 남아 있을 수 있어요.
- **값 길이**: Marinara 채팅 변수는 10,000자까지라서, 그보다 긴 메시지는 앞부분만 들어가요.
- **`{{firstIncludedMessageId}}`**: Marinara에서는 알 수 없어서 비어 있어요.

## 개발

```bash
npm install
npm test        # 변환기·값 채우기 단위 테스트
ST_DIR=/path/to/SillyTavern MARINARA_DIR=/path/to/Marinara-Engine npm run test:diff
```

`test:diff`는 SillyTavern의 실제 매크로 엔진(`tools/st-harness`)과 Marinara의 실제 매크로 엔진에 같은 글을 넣어 결과와 변수 상태를 비교해요.

- `tools/diff/corpus.mjs`: 예문 모음
- `tools/diff/fuzz.mjs`: 무작위 조합 비교

SillyTavern에 매크로가 추가되면 아래 명령으로 `src/st-registry.js`를 다시 만들어요.

```bash
node --import ./tools/st-harness/.work/register.mjs tools/dump-st-registry.mjs
```

| 파일 | 내용 |
|---|---|
| `src/converter.js` | SillyTavern 문법 파서와 Marinara 문법 출력 |
| `src/bridge.js` | 생성 직전 값 채우기, 전역 변수 저장 |
| `src/extension.js` | Marinara 안의 화면 |
| `build.mjs` | `release/`의 설치용 패키지와 테스트용 `dist/`를 만들어요 |
