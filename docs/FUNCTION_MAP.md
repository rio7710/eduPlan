# eduFixer 기능 및 함수 정의서 (Function Map)

이 문서는 `eduFixer` 프로젝트의 주요 로직 분산 현황을 파악하고, 체계적인 리팩토링(분할 및 병합)을 위한 가이드라인으로 사용됩니다.

---

## 1. Electron 메인 프로세스 (`electron/main.cjs`)
**역할:** 시스템 레벨 작업, 데이터베이스(SQLite) 관리, Python 스크립트 실행, IPC 핸들링

### 주요 함수 및 로직
| 구분 | 함수/핸들러 명 | 주요 기능 및 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **초기화** | `createWindow()` | 브라우저 창 생성, 메뉴 설정, 자동 업데이트 연동 | 앱 진입점 |
| | `ensureDatabase()` | SQLite 데이터베이스 연결 및 초기 테이블(documents 등) 생성 | 앱 시작 시 실행 |
| **파일 시스템** | `ipcMain.handle('dialog:open-file')` | OS 파일 선택창 호출 (PDF, MD, TXT 등 필터 적용) | |
| | `ipcMain.handle('app:read-file')` | 경로를 통한 파일 내용 읽기 (텍스트 인코딩 처리) | |
| | `ipcMain.handle('document:save')` | 편집된 내용 저장, 수정 내역(Diff) 추출 및 DB 기록 | **핵심 로직 집중** |
| **문서 변환** | `convertPdfWithPython()` | PDF 파일을 텍스트/이미지로 변환하는 Python 프로세스 제어 | `pdf_to_md_pages.py` |
| **ML 파이프라인** | `extractEditPatches()` | 이전 버전과 현재 버전의 텍스트 차이점 분석 (학습 데이터 생성용) | |
| **기타 핸들러** | `scanLogoReviewItems` | 로고 및 이미지 검토 항목 스캔 및 결과 반환 | Python 엔진 연동 |

---

## 2. React 렌더러 - 메인 오케스트레이터 (`src/App.tsx`)
**역할:** 전역 상태 관리, 뷰(View) 전환 제어, 전역 이벤트 핸들링, UI 레이아웃 구성

### 주요 상태 및 핸들러
| 구분 | 상태/함수 명 | 주요 기능 및 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **상태 관리** | `activeView`, `editorMode` | 현재 활성화된 화면(Welcome, Editor, Review 등) 및 에디터 모드 관리 | `useState` 다수 선언됨 |
| | `currentDocument` | 현재 편집 중인 문서의 메타데이터 및 내용 보유 | |
| **문서 제어** | `handleOpenFile()` | 메인 프로세스에 파일 열기 요청 후 결과 상태 반영 | |
| | `handleSaveCurrentDocument()` | 현재 편집 내용 저장 요청 및 성공 시 토스트 알림 | Ctrl+S 연동 |
| **동기화 로직** | `issueScrollSyncRequest()` | 에디터와 프리뷰 간 스크롤 위치 동기화 명령 발행 | |
| | `handleContentChange()` | 에디터의 변경 내용을 `currentDocument` 상태에 즉시 반영 | |
| **UI 렌더링** | `render()` (JSX) | 사이드바, 상태바, 탭, 메인 뷰 컴포넌트들의 배치 및 Props 전달 | 1,800라인 이상 |

---

## 3. 미리보기 컴포넌트 (`src/components/PreviewPane.tsx`)
**역할:** 마크다운 렌더링, 정밀 선택 모드(라인/블록) 제공, 커스텀 복사 로직

### 주요 함수 및 로직
| 구분 | 함수 명 | 주요 기능 및 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **렌더링** | `getPreviewBlocks()` | 마크다운을 의미론적 블록(--- 기준)으로 쪼개어 개별 렌더링 | 렌더링 최적화 핵심 |
| | `applyColonLineBreak()` | 특수 규칙(콜론 `:` 기준 줄바꿈)을 적용하여 HTML 생성 | |
| **선택/복사** | `resolveSourceLineFromPointer()` | 프리뷰 클릭 위치를 원본 마크다운 라인 번호로 역추적 | 역참조 로직 |
| | `copyFromCurrentSelection()` | 선택 영역을 분석하여 HTML 표 유지, 특수문자 제거 등 처리 후 복사 | 커스텀 클립보드 |
| **스크롤** | `handleScroll` | 사용자의 스크롤 위치를 비율(0~1)로 계산하여 상위로 전달 | |

---

## 4. 에디터 컴포넌트 (`src/components/CodeEditor.tsx`)
**역할:** 텍스트 편집(CodeMirror), 구문 강조, 실시간 변경 감지

### 주요 함수 및 로직
| 구분 | 함수 명 | 주요 기능 및 역할 | 비고 |
| :--- | :--- | :--- | :--- |
| **편집기 제어** | `lineChangeListener` | 커서 이동 및 텍스트 선택 변경 시 현재 라인 정보 업데이트 | |
| **스크롤** | `resolveTopVisibleLine()` | 에디터 상단에 보이는 실제 라인 번호를 계산하여 동기화 준비 | |
| **입력 핸들링** | `onChange` | 사용자의 입력을 실시간으로 부모 컴포넌트에 전달 | |

---

## 🛠️ 리팩토링 개선 방향 (TO-BE)

### 1. 로직 분리 및 모듈화
*   **IPC Handlers:** `main.cjs`에 몰려 있는 핸들러들을 `electron/ipc/` 폴더 내 기능별 파일로 분리.
*   **Custom Hooks:** `App.tsx`의 상태와 로직을 `useDocument.ts`, `useEditorSync.ts`, `useLayout.ts` 등으로 분리.
*   **Utility Consolidation:** 중복되는 텍스트 처리 및 경로 계산 로직을 `src/utils/`로 통합.

### 2. 안정성 강화
*   **Zod Schema:** IPC 통신 시 데이터 타입을 Zod로 검증하여 런타임 오류 방지.
*   **Selection Persistence:** 스크롤 및 리렌더링 시 유실되는 선택 영역(Selection) 유지 로직 강화.
