/* =========================================
   eduPlan - Dummy App JS
   이벤트 참조: docs/09_ui-events.md
   ========================================= */

// ── 상태 ────────────────────────────────────
const state = {
  currentView: 'welcome',
  currentDoc: null,
  openTabs: [{ id: 'welcome', label: '시작', icon: '🏠' }],
  blockCount: 6,
  isDirty: false,
  syncStatus: 'synced',   // synced | pending | syncing | error | offline
  modalCallback: null,
  uploadTimer: null,
  editorMode: 'markdown', // wysiwyg | markdown | html | preview
  // 파일 접근 상태
  isDesktop: Boolean(window.eduFixerApi?.isDesktop),
  selectedFile: null,
  selectedFolder: null,
  batchFiles: [],
  batchSelected: new Set(),
  sourceTab: 'single',
  theme: 'dark',
  explorerFiles: [],
};

// ── 초기화 ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initActivityBar();
  initWindowControls();
  initKeyboard();
  initPlatform();
  loadShellState();
  renderExplorer();
  updateStatusBar();
  initFoldButtons();
});

function initTheme() {
  const savedTheme = localStorage.getItem('eduplan-theme');
  state.theme = savedTheme === 'light' ? 'light' : 'dark';
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle('light-theme', state.theme === 'light');
  const icon = document.getElementById('theme-toggle-icon');
  const text = document.getElementById('theme-toggle-text');
  const btn = document.getElementById('theme-toggle-btn');
  if (icon) icon.textContent = state.theme === 'light' ? '☀️' : '🌙';
  if (text) text.textContent = state.theme === 'light' ? '라이트 모드' : '다크 모드';
  if (btn) btn.title = state.theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환';
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('eduplan-theme', state.theme);
  applyTheme();
  toast(`${state.theme === 'light' ? '라이트' : '다크'} 모드로 전환됨`, 'info');
}

// ── 플랫폼 초기화 ─────────────────────────────
function initPlatform() {
  state.isDesktop = Boolean(window.eduFixerApi?.isDesktop);
  const badge = document.getElementById('platform-badge');
  if (badge) {
    badge.textContent = state.isDesktop ? '🖥 Desktop 모드' : '🌐 Web 모드';
    badge.style.background = state.isDesktop
      ? 'rgba(78,201,176,0.15)' : 'rgba(86,156,214,0.15)';
    badge.style.color = state.isDesktop ? '#4ec9b0' : '#569cd6';
    badge.style.borderColor = state.isDesktop
      ? 'rgba(78,201,176,0.3)' : 'rgba(86,156,214,0.3)';
  }
}

function initWindowControls() {
  const buttons = document.querySelectorAll('.titlebar-right .win-btn');
  if (buttons.length < 3 || !window.eduFixerApi) return;
  buttons[0].onclick = () => window.eduFixerApi.minimizeWindow();
  buttons[1].onclick = () => window.eduFixerApi.maximizeToggle();
  buttons[2].onclick = () => window.eduFixerApi.closeWindow();
}

async function loadShellState() {
  if (!window.eduFixerApi?.getShellState) return;
  try {
    await window.eduFixerApi.getShellState();
  } catch (error) {
    console.error(error);
  }
}

// ── Activity Bar ────────────────────────────
function initActivityBar() {
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      switchPanel(panel);
    });
  });
}

function switchPanel(panelId) {
  // activity btn 활성화
  document.querySelectorAll('.activity-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.panel === panelId);
  });
  // panel 활성화
  document.querySelectorAll('.panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${panelId}`);
  });
  // settings는 별도 뷰
  if (panelId === 'settings') openView('settings');
}

// ── 탭 / 뷰 ─────────────────────────────────
function openView(viewId, label, icon) {
  const labels = {
    welcome:  { label: '시작',       icon: '🏠' },
    upload:   { label: 'PDF 업로드', icon: '📎' },
    editor:   { label: label || '문서', icon: icon || '📄' },
    review:   { label: 'ML 검토',    icon: '✅' },
    settings: { label: '설정',       icon: '⚙️' },
  };

  const tab = labels[viewId] || { label: viewId, icon: '📄' };
  addTab(viewId, tab.label, tab.icon);
  switchTab(viewId);
}

function addTab(id, label, icon) {
  if (state.openTabs.find(t => t.id === id)) return;
  state.openTabs.push({ id, label, icon });
  renderTabs();
}

function renderTabs() {
  const tabbar = document.getElementById('tabbar');
  tabbar.innerHTML = '';
  state.openTabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab${state.currentView === tab.id ? ' active' : ''}`;
    el.id = `tab-${tab.id}`;
    el.setAttribute('data-id', tab.id);  // EVT-ID: tab
    el.innerHTML = `
      <span class="tab-icon">${tab.icon}</span>
      <span class="tab-label">${tab.label}</span>
      <span class="tab-close" onclick="closeTab(event,'${tab.id}')">×</span>
    `;
    el.addEventListener('click', () => switchTab(tab.id));
    tabbar.appendChild(el);
  });
}

function switchTab(viewId) {
  state.currentView = viewId;
  // 탭 활성화
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id === viewId);
  });
  // 뷰 활성화
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewId}`);
  });
  updateStatusBar();
}

function closeTab(event, tabId) {
  event.stopPropagation();
  // EVT-CMN-004: 미저장 변경 있을 때 이탈 확인
  if (tabId === 'editor' && state.isDirty) {
    showModal(
      '저장하지 않고 닫으시겠습니까?',
      '변경사항이 저장되지 않습니다.',
      '닫기',
      () => { doCloseTab(tabId); }
    );
  } else {
    doCloseTab(tabId);
  }
}

function doCloseTab(tabId) {
  state.openTabs = state.openTabs.filter(t => t.id !== tabId);
  if (state.openTabs.length === 0) {
    state.openTabs = [{ id: 'welcome', label: '시작', icon: '🏠' }];
  }
  renderTabs();
  const next = state.openTabs[state.openTabs.length - 1];
  switchTab(next.id);
}

// ── 사이드바 트리 ─────────────────────────────
function toggleTree(header) {
  const arrow = header.querySelector('.tree-arrow');
  const items = header.nextElementSibling;
  arrow.classList.toggle('collapsed');
  items.style.display = items.style.display === 'none' ? '' : 'none';
}

// ── 문서 열기 ─────────────────────────────────
// EVT-DOCS-001: 문서 클릭
function openDocument(docId, title) {
  state.currentDoc = { id: docId, title };
  state.isDirty = false;

  // 사이드바 활성화
  document.querySelectorAll('.tree-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === docId);
  });

  // 에디터 제목 업데이트
  const titleEl = document.getElementById('editor-doc-title');
  if (titleEl) titleEl.textContent = title;

  openView('editor', title, '📄');
  updateStatusBar();
  toast(`"${title}" 열림`, 'info');
}

function getExplorerIcon(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'html') return '🌐';
  if (ext === 'txt') return '📝';
  return '📄';
}

function getFolderName(folderPath) {
  if (!folderPath) return '선택한 폴더';
  const normalized = folderPath.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || normalized;
}

function renderExplorer() {
  const workingList = document.getElementById('explorer-working-list');
  if (!workingList) return;

  if (state.explorerFiles.length) {
    const folderLabel = getFolderName(state.selectedFolder);
    workingList.innerHTML = `
      <div class="tree-item tree-folder-item" title="${state.selectedFolder || folderLabel}">
        <span class="tree-icon">📁</span>
        <span class="tree-label">${folderLabel}</span>
      </div>
      ${state.explorerFiles.map(file => `
        <div class="tree-item tree-child-item ${state.currentDoc?.id === file.id ? 'active' : ''}" data-id="${file.id}" onclick="openExplorerFile('${file.id}')">
          <span class="tree-icon">${getExplorerIcon(file.name)}</span>
          <span class="tree-label">${file.name}</span>
          <span class="tree-badge ${file.status || 'synced'}">${file.status === 'done' ? '✓' : '●'}</span>
        </div>
      `).join('')}
    `;
    return;
  }

  const defaultFiles = [
    { id: 'doc-001', name: '2024 1학기 수업계획서.md', status: 'synced' },
    { id: 'doc-002', name: '3월 교육자료_수학.md', status: 'pending' },
    { id: 'doc-003', name: '과학 실험 지도안.md', status: 'synced' },
  ];

  workingList.innerHTML = defaultFiles.map(file => `
    <div class="tree-item ${state.currentDoc?.id === file.id ? 'active' : ''}" data-id="${file.id}" onclick="openExplorerFile('${file.id}')">
      <span class="tree-icon">${getExplorerIcon(file.name)}</span>
      <span class="tree-label">${file.name}</span>
      <span class="tree-badge ${file.status || 'synced'}">${file.status === 'done' ? '✓' : '●'}</span>
    </div>
  `).join('');
}

async function openExplorerFile(fileId) {
  const file = state.explorerFiles.find(item => item.id === fileId);
  if (!file) {
    openDocument(fileId, fileId);
    return;
  }

  const ext = (file.ext || '').toLowerCase();
  if (ext === '.pdf') {
    toast(`"${file.name}"은 PDF입니다. 업로드 흐름에서 처리하세요.`, 'info');
    return;
  }

  if (state.isDesktop && window.eduFixerApi?.openRecent) {
    try {
      const loaded = await window.eduFixerApi.openRecent(file.path);
      if (loaded) {
        openLoadedDocument(loaded);
        renderExplorer();
      }
      return;
    } catch (error) {
      console.error(error);
      toast('파일 열기 실패', 'error');
      return;
    }
  }

  openDocument(file.id, file.name);
}

// ── 블록 에디터 이벤트 ────────────────────────

// ── 에디터 모드 전환 (EVT-EDITOR-011) ──────────
// docs/10_editor-modes.md 참조
const MODE_LABELS = {
  wysiwyg:  'WYSIWYG 편집 모드',
  markdown: 'Markdown 소스 편집 모드',
  html:     'HTML 소스 편집 모드',
  preview:  '보기 모드 (읽기 전용)',
};

function switchEditorMode(mode) {
  state.editorMode = mode;

  // 버튼 활성화
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `mode-${mode}`);
  });

  // 패널 전환
  document.querySelectorAll('.editor-mode-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-mode-${mode}`);
  });

  // 모드 정보 레이블
  const info = document.getElementById('mode-info');
  if (info) info.innerHTML = `<span class="mode-current-label">${MODE_LABELS[mode] || mode}</span>`;

  // 소스 에디터 포커스
  if (mode === 'markdown') {
    setTimeout(() => document.getElementById('md-source')?.focus(), 50);
  } else if (mode === 'html') {
    setTimeout(() => document.getElementById('html-source')?.focus(), 50);
  }
}

// EVT-EDITOR-010: 블록 포커스
function blockFocused(blockId) {
  document.querySelectorAll('.block-wrap').forEach(b => {
    b.classList.toggle('focused', b.id === blockId);
  });

  // 로케이션 바 업데이트
  const blocks = Array.from(document.querySelectorAll('.block-wrap'));
  const idx = blocks.findIndex(b => b.id === blockId);
  const total = blocks.length;
  const blockEl = document.getElementById(blockId);
  const contentEl = blockEl?.querySelector('.block-content');
  const chars = (contentEl?.innerText || '').trim().length;

  // 블록 타입에서 섹션명 추정
  const badge = blockEl?.querySelector('.block-type-badge')?.textContent?.trim() || '?';
  const typeMap = { H: '제목', T: '본문', I: '이미지', TB: '표' };
  const typeName = typeMap[badge] || badge;

  const locBlock = document.getElementById('loc-block');
  const locStat  = document.getElementById('loc-stat');
  const locChars = document.getElementById('loc-chars');
  const locSection = document.getElementById('loc-section');
  const locDocName = document.getElementById('loc-doc-name');

  if (locDocName && state.currentDoc) locDocName.textContent = state.currentDoc.fileName;
  if (locSection) locSection.textContent = typeName;
  if (locBlock)   locBlock.textContent = `블록 ${idx + 1}`;
  if (locStat)    locStat.textContent = `블록 ${idx + 1} / ${total}`;
  if (locChars)   locChars.textContent = `${chars}자`;
}

// EVT-EDITOR-012: 편집 완료 (blur)
function blockEdited(el, blockId) {
  state.isDirty = true;
  markDirty();
  // 더미 diff 기록
  console.log(`[EVT-EDITOR-012] block=${blockId} edited. diff recorded.`);
}

// EVT-EDITOR-013: 블록 삭제
function deleteBlock(blockId) {
  showModal(
    '블록을 삭제할까요?',
    '삭제된 블록은 되돌리기로 복구할 수 있습니다.',
    '삭제',
    () => {
      const el = document.getElementById(blockId);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-8px)';
        el.style.transition = 'opacity 0.2s, transform 0.2s';
        setTimeout(() => {
          el.remove();
          state.blockCount = Math.max(0, state.blockCount - 1);
          state.isDirty = true;
          markDirty();
          updateStatusBar();
          toast('블록 삭제됨 (되돌리기: Ctrl+Z)', 'info');
        }, 200);
      }
    }
  );
}

// EVT-EDITOR-014: 블록 병합
function mergeBlockNext(blockId) {
  const el = document.getElementById(blockId);
  const next = el?.nextElementSibling;
  if (!next || next.classList.contains('add-block-row')) {
    toast('병합할 다음 블록이 없습니다.', 'error');
    return;
  }
  showModal(
    '다음 블록과 병합할까요?',
    '두 블록의 내용이 하나로 합쳐집니다.',
    '병합',
    () => {
      const curContent = el.querySelector('.block-content');
      const nextContent = next.querySelector('.block-content');
      if (curContent && nextContent) {
        curContent.innerHTML += '<br><br>' + nextContent.innerHTML;
      }
      next.style.opacity = '0';
      setTimeout(() => {
        next.remove();
        state.blockCount = Math.max(0, state.blockCount - 1);
        state.isDirty = true;
        markDirty();
        updateStatusBar();
        toast('블록 병합 완료', 'success');
      }, 200);
    }
  );
}

// EVT-EDITOR-015: 블록 분리
function splitBlock(blockId) {
  const el = document.getElementById(blockId);
  const content = el.querySelector('.block-content');
  if (!content) return;

  const text = content.innerText.trim();
  const mid = Math.floor(text.length / 2);
  const breakAt = text.indexOf(' ', mid);
  if (breakAt < 0 || text.length < 20) {
    toast('분리할 수 있는 충분한 내용이 없습니다.', 'error');
    return;
  }

  const part1 = text.slice(0, breakAt);
  const part2 = text.slice(breakAt + 1);
  content.innerText = part1;

  const newId = `block-new-${Date.now()}`;
  const newBlock = createTextBlock(newId, part2);
  el.after(newBlock);

  state.blockCount++;
  state.isDirty = true;
  markDirty();
  updateStatusBar();
  toast('블록 분리 완료', 'success');
}

// EVT-EDITOR-018: 블록 추가
function addBlock() {
  const editor = document.getElementById('block-editor');
  const addRow = editor.querySelector('.add-block-row');
  const newId = `block-new-${Date.now()}`;
  const newBlock = createTextBlock(newId, '');
  addRow.before(newBlock);

  setTimeout(() => {
    const contentEl = newBlock.querySelector('.block-content');
    if (contentEl) contentEl.focus();
  }, 50);

  state.blockCount++;
  state.isDirty = true;
  markDirty();
  updateStatusBar();
}

function createTextBlock(id, text) {
  const div = document.createElement('div');
  div.className = 'block-wrap';
  div.id = id;
  div.draggable = true;
  div.innerHTML = `
    <div class="source-block-gutter">
      <div class="sbg-line sbg-first">
        <span class="block-num">${document.querySelectorAll('.block-wrap').length + 1}</span>
        <span class="block-type-badge">T</span>
        <span class="sbg-lnum">1</span>
      </div>
    </div>
    <div class="block-drag-handle" title="드래그하여 순서 변경">⠿</div>
    <div class="block-content text-block" contenteditable="true"
      onblur="blockEdited(this,'${id}')" onfocus="blockFocused('${id}')">${text}</div>
    <div class="block-toolbar">
      <button class="btool" onclick="splitBlock('${id}')" title="블록 분리">✂</button>
      <button class="btool" onclick="mergeBlockNext('${id}')" title="다음 블록과 병합">⊕</button>
      <button class="btool danger" onclick="deleteBlock('${id}')" title="블록 삭제">🗑</button>
    </div>
  `;
  div.setAttribute('ondragstart', `blockDragStart(event)`);
  div.setAttribute('ondragover', `blockDragOver(event)`);
  div.setAttribute('ondrop', `blockDrop(event)`);
  div.style.opacity = '0';
  div.style.transform = 'translateY(-6px)';
  requestAnimationFrame(() => {
    div.style.transition = 'opacity 0.2s, transform 0.2s';
    div.style.opacity = '1';
    div.style.transform = 'translateY(0)';
  });
  return div;
}

// EVT-EDITOR-001: 저장 (Ctrl+S)
async function saveDocument() {
  if (!state.isDirty) { toast('이미 저장되었습니다.', 'info'); return; }
  setSyncStatus('syncing');
  const btn = document.querySelector('.btn-primary.btn-sm');
  if (btn) { btn.textContent = '저장 중...'; btn.disabled = true; }

  if (state.isDesktop && window.eduFixerApi?.saveDocument) {
    const markdownContent = Array.from(
      document.querySelectorAll('#panel-mode-markdown .source-block-textarea')
    ).map(el => el.value).join('\n\n');

    try {
      const saved = await window.eduFixerApi.saveDocument({
        filePath: state.currentDoc?.filePath || '',
        fileName: state.currentDoc?.fileName || 'document.md',
        content: markdownContent,
      });
      if (saved) {
        state.currentDoc = {
          ...(state.currentDoc || {}),
          id: saved.id,
          fileName: saved.fileName,
          filePath: saved.filePath,
        };
      }
    } catch (error) {
      if (btn) { btn.innerHTML = '💾 저장'; btn.disabled = false; }
      setSyncStatus('error');
      toast('저장 실패', 'error');
      console.error(error);
      return;
    }
  }

  setTimeout(() => {
    state.isDirty = false;
    const meta = document.querySelector('.doc-meta');
    if (meta) meta.textContent = `블록 ${state.blockCount}개 · 저장됨`;
    if (btn) { btn.innerHTML = '💾 저장'; btn.disabled = false; }
    setSyncStatus('pending');
    toast('저장 완료. 동기화 대기 중...', 'success');

    // 동기화 시뮬레이션
    setTimeout(() => {
      setSyncStatus('synced');
      toast('서버 동기화 완료', 'success');
    }, 1800);
  }, 800);
}

// EVT-EDITOR-003: MD 내보내기
function exportMd() {
  toast('MD 파일 다운로드 중...', 'info');
  setTimeout(() => toast('✓ 파일 저장 완료: document.md', 'success'), 1000);
}

// EVT-EDITOR-004: 되돌리기
function dummyUndo() { toast('되돌리기 (Ctrl+Z)', 'info'); }

// EVT-EDITOR-005: 다시실행
function dummyRedo() { toast('다시실행 (Ctrl+Y)', 'info'); }

function markDirty() {
  const meta = document.querySelector('.doc-meta');
  if (meta) meta.textContent = `블록 ${state.blockCount}개 · 미저장`;
}

// ── 드래그앤드롭 (블록 순서) ─────────────────
// EVT-EDITOR-016
let dragSrcEl = null;
function blockDragStart(e) {
  dragSrcEl = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  dragSrcEl.style.opacity = '0.5';
}
function blockDragOver(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (target !== dragSrcEl) {
    document.querySelectorAll('.block-wrap').forEach(b => b.classList.remove('drag-target'));
    target.classList.add('drag-target');
  }
  return false;
}
function blockDrop(e) {
  e.stopPropagation();
  const target = e.currentTarget;
  if (dragSrcEl && dragSrcEl !== target) {
    const parent = target.parentNode;
    const srcIdx = Array.from(parent.children).indexOf(dragSrcEl);
    const tgtIdx = Array.from(parent.children).indexOf(target);
    if (srcIdx < tgtIdx) {
      parent.insertBefore(dragSrcEl, target.nextSibling);
    } else {
      parent.insertBefore(dragSrcEl, target);
    }
    state.isDirty = true;
    markDirty();
    toast('블록 순서 변경됨', 'info');
  }
  document.querySelectorAll('.block-wrap').forEach(b => {
    b.classList.remove('drag-target');
    b.style.opacity = '1';
  });
  dragSrcEl = null;
}

// ── 파일/폴더 소스 탭 ─────────────────────────

function switchSourceTab(tabId) {
  state.sourceTab = tabId;
  document.querySelectorAll('.source-tab').forEach(t => {
    t.classList.toggle('active', t.id === `tab-${tabId}`);
  });
  document.querySelectorAll('.source-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabId}`);
  });
}

// ── 단일 파일 선택 ────────────────────────────

// EVT-UPLOAD-001: 로컬 파일 선택 (네이티브 다이얼로그 시뮬레이션)
async function openLocalFile() {
  if (state.isDesktop && window.eduFixerApi?.openFile) {
    try {
      const picked = await window.eduFixerApi.openFile();
      if (!picked) return;
      state.selectedFile = {
        name: picked.fileName,
        path: picked.filePath,
        size: `${picked.blockCount || 0} blocks`,
        content: picked.content || '',
      };
      showSelectedFile(picked.fileName, picked.filePath, `${picked.blockCount || 0} blocks`);
      return;
    } catch (error) {
      console.error(error);
      toast('파일 열기 실패', 'error');
      return;
    }
  } else if (!state.isDesktop) {
    // 실제: window.showOpenFilePicker({ types: [{ accept: { 'application/pdf': ['.pdf'] } }] })
    document.getElementById('file-input').click();
  } else {
    simulateNativeFilePicker();
  }
}

function simulateNativeFilePicker() {
  // 네이티브 다이얼로그 열림 시뮬레이션 (실제는 IPC 통신)
  toast('🖥 네이티브 파일 탐색기 열기...', 'info');
  const dummyFiles = [
    { name: '2024_1학기_수업계획서.pdf', path: 'C:\\Users\\교사\\Documents\\교육자료\\2024_1학기_수업계획서.pdf', size: '1.2 MB' },
    { name: '3월_교육자료_수학.pdf',      path: 'C:\\Users\\교사\\Downloads\\3월_교육자료_수학.pdf',           size: '3.4 MB' },
    { name: '과학_실험_지도안.pdf',        path: 'D:\\OneDrive\\교육\\과학_실험_지도안.pdf',                   size: '856 KB' },
  ];
  setTimeout(() => {
    const picked = dummyFiles[Math.floor(Math.random() * dummyFiles.length)];
    showSelectedFile(picked.name, picked.path, picked.size);
  }, 600);
}

function showSelectedFile(name, path, size) {
  state.selectedFile = { name, path, size };
  document.getElementById('sfi-name').textContent = name;
  document.getElementById('sfi-meta').textContent = `경로: ${path}  ·  크기: ${size}`;
  document.getElementById('selected-file-info').style.display = 'block';
}

function clearSelectedFile() {
  state.selectedFile = null;
  document.getElementById('selected-file-info').style.display = 'none';
}

function confirmSingleFile() {
  if (!state.selectedFile) return;
  if (state.selectedFile.content) {
    openLoadedDocument(state.selectedFile);
    clearSelectedFile();
    return;
  }
  startUploadSimulation(state.selectedFile.name);
  clearSelectedFile();
}

function openLoadedDocument(file) {
  state.currentDoc = {
    id: file.path || file.name,
    fileName: file.name,
    filePath: file.path || '',
  };
  state.blockCount = countBlocksFromContent(file.content || '');
  state.isDirty = false;

  const title = document.getElementById('editor-doc-title');
  if (title) title.textContent = file.name;
  const confirmed = document.getElementById('editor-doc-confirmed');
  if (confirmed) confirmed.textContent = `확정명: ${file.name.replace(/\.[^.]+$/, '')}`;
  const locDocName = document.getElementById('loc-doc-name');
  if (locDocName) locDocName.textContent = file.name;

  const blocks = splitContentToBlocks(file.content || '');
  const textareas = document.querySelectorAll('#panel-mode-markdown .source-block-textarea');
  textareas.forEach((el, index) => {
    el.value = blocks[index] ?? '';
  });

  const meta = document.querySelector('.doc-meta');
  if (meta) meta.textContent = `블록 ${state.blockCount}개 · 저장됨`;

  openView('editor', file.name, '📄');
}

function splitContentToBlocks(content) {
  return content.split(/\n\s*\n/).filter(Boolean);
}

function countBlocksFromContent(content) {
  return splitContentToBlocks(content).length || 1;
}

// ── 폴더 선택 & 일괄 처리 ─────────────────────

async function openLocalFolder() {
  if (state.isDesktop && window.eduFixerApi?.openFolder) {
    try {
      const folder = await window.eduFixerApi.openFolder();
      if (!folder) return;
      state.selectedFolder = folder.path;
      state.batchFiles = folder.files.map(file => ({ ...file, selected: true }));
      state.batchSelected = new Set(state.batchFiles.map(f => f.id));
      state.explorerFiles = folder.files.map(file => ({
        id: file.path || file.id,
        name: file.name,
        path: file.path,
        ext: file.ext || '',
        status: 'synced',
      }));
      renderFolderScan(folder.path, folder.files);
      renderExplorer();
      switchPanel('explorer');
      return;
    } catch (error) {
      console.error(error);
      toast('폴더 열기 실패', 'error');
      return;
    }
  } else if (!state.isDesktop) {
    // 실제: const dir = await window.showDirectoryPicker()
    toast('🌐 폴더 선택기 열기...', 'info');
    setTimeout(() => simulateFolderScan(), 700);
  } else {
    toast('🖥 폴더 탐색기 열기...', 'info');
    setTimeout(() => simulateFolderScan(), 700);
  }
}

function simulateFolderScan() {
  const folders = [
    {
      path: 'D:\\OneDrive\\교육자료\\2024_1학기',
      files: [
        { name: '수업계획서_1주차.md',  size: '0.1 MB' },
        { name: '수업계획서_2주차.txt', size: '0.1 MB' },
        { name: '평가기준표.pdf',       size: '0.5 MB' },
        { name: '수업자료_보충.html',   size: '0.2 MB' },
      ]
    },
    {
      path: 'C:\\Users\\교사\\Documents\\교육',
      files: [
        { name: '3월_교육자료.md',    size: '0.2 MB' },
        { name: '4월_교육자료.html',  size: '0.2 MB' },
        { name: '과학_지도안.pdf',    size: '1.1 MB' },
      ]
    },
  ];
  const picked = folders[Math.floor(Math.random() * folders.length)];
  state.selectedFolder = picked.path;
  state.batchFiles = picked.files.map((f, i) => ({ ...f, id: `bf-${i}`, selected: true }));
  state.batchSelected = new Set(state.batchFiles.map(f => f.id));
  state.explorerFiles = picked.files.map((f, i) => ({
    id: `file-${i}`,
    name: f.name,
    path: `${picked.path}\\${f.name}`,
    ext: `.${f.name.split('.').pop().toLowerCase()}`,
    status: 'synced',
  }));
  renderFolderScan(picked.path, picked.files);
  renderExplorer();
}

function renderFolderScan(path, files) {
  document.getElementById('folder-path-text').textContent = path;
  document.getElementById('batch-count').textContent = `문서 ${files.length}개 발견`;
  renderBatchFileList();
  document.getElementById('folder-scan-result').style.display = 'block';
  updateBatchSummary();
}

function renderBatchFileList() {
  const list = document.getElementById('batch-file-list');
  list.innerHTML = state.batchFiles.map(f => `
    <div class="batch-file-item">
      <input type="checkbox" ${f.selected ? 'checked' : ''}
        onchange="toggleBatchFile('${f.id}', this.checked)" />
      <span class="bfi-icon">${getExplorerIcon(f.name)}</span>
      <div class="bfi-body">
        <div class="bfi-name">${f.name}</div>
        <div class="bfi-size">${f.size}</div>
      </div>
      <span class="bfi-status">${f.selected ? '' : '제외'}</span>
    </div>
  `).join('');
}

function toggleBatchFile(id, checked) {
  const f = state.batchFiles.find(f => f.id === id);
  if (f) f.selected = checked;
  if (checked) state.batchSelected.add(id);
  else state.batchSelected.delete(id);
  updateBatchSummary();
}

function selectAllFiles(val) {
  state.batchFiles.forEach(f => { f.selected = val; });
  state.batchSelected = val ? new Set(state.batchFiles.map(f => f.id)) : new Set();
  renderBatchFileList();
  updateBatchSummary();
}

function updateBatchSummary() {
  const n = state.batchFiles.filter(f => f.selected).length;
  document.getElementById('batch-summary').textContent = `${n}개 선택됨`;
}

function clearFolder() {
  state.selectedFolder = null;
  state.explorerFiles = [];
  state.batchFiles = [];
  state.batchSelected.clear();
  document.getElementById('folder-scan-result').style.display = 'none';
  renderExplorer();
}

function refreshExplorerFolder() {
  if (!state.selectedFolder) {
    openLocalFolder();
    return;
  }

  if (state.isDesktop) {
    openLocalFolder();
    return;
  }

  renderExplorer();
  toast('탐색기 목록 새로고침 완료', 'info');
}

// 일괄 처리 시작
function startBatchProcess() {
  const selected = state.batchFiles.filter(f => f.selected);
  if (!selected.length) { toast('선택된 파일이 없습니다.', 'error'); return; }

  document.getElementById('folder-scan-result').style.display = 'none';
  document.getElementById('upload-options').style.display = 'none';

  const batchArea = document.getElementById('batch-progress-area');
  batchArea.style.display = 'block';
  document.getElementById('batch-progress-title').textContent = `일괄 처리 중... (0 / ${selected.length})`;

  const listEl = document.getElementById('batch-progress-list');
  listEl.innerHTML = selected.map(f => `
    <div class="bpl-item" id="bpl-${f.id}">
      <span class="bpl-icon">📄</span>
      <span class="bpl-name">${f.name}</span>
      <div class="bpl-bar-wrap"><div class="bpl-bar" id="bplbar-${f.id}" style="width:0%"></div></div>
      <span class="bpl-status waiting" id="bplst-${f.id}">대기</span>
    </div>
  `).join('');

  processBatchQueue(selected, 0);
}

function processBatchQueue(files, idx) {
  if (idx >= files.length) {
    document.getElementById('batch-progress-title').textContent = `✓ 일괄 처리 완료 (${files.length}개)`;
    toast(`${files.length}개 파일 처리 완료`, 'success');
    setTimeout(() => {
      document.getElementById('batch-progress-area').style.display = 'none';
      document.getElementById('upload-options').style.display = 'block';
      document.getElementById('folder-scan-result').style.display = 'none';
    }, 1800);
    return;
  }
  const f = files[idx];
  document.getElementById('batch-progress-title').textContent =
    `일괄 처리 중... (${idx + 1} / ${files.length})`;
  const statusEl = document.getElementById(`bplst-${f.id}`);
  const barEl    = document.getElementById(`bplbar-${f.id}`);
  if (statusEl) { statusEl.textContent = '처리 중'; statusEl.className = 'bpl-status processing'; }

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 30 + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      if (barEl)    barEl.style.width = '100%';
      if (statusEl) { statusEl.textContent = '완료'; statusEl.className = 'bpl-status done'; }
      setTimeout(() => processBatchQueue(files, idx + 1), 300);
    }
    if (barEl) barEl.style.width = Math.min(progress, 100) + '%';
  }, 200);
}

function cancelBatch() {
  showModal(
    '일괄 처리를 취소할까요?',
    '진행 중인 모든 작업이 중단됩니다.',
    '취소',
    () => {
      document.getElementById('batch-progress-area').style.display = 'none';
      document.getElementById('upload-options').style.display = 'block';
      toast('일괄 처리 취소됨', 'warning');
    }
  );
}

// ── 업로드 이벤트 ─────────────────────────────

// EVT-UPLOAD-001: 파일 드롭
function handleDrop(e) {
  e.preventDefault();
  const dropzone = document.getElementById('dropzone');
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  processFile(file);
}

// EVT-UPLOAD-001: 파일 선택
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  processFile(file);
}

function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    toast('PDF 파일만 업로드할 수 있습니다. (EP-1001)', 'error');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast('파일 크기가 50MB를 초과합니다. (EP-1002)', 'error');
    return;
  }
  startUploadSimulation(file.name);
}

// EVT-UPLOAD-002: 업로드 시작 시뮬레이션
function startUploadSimulation(fileName) {
  document.getElementById('dropzone').style.display = 'none';
  const progressArea = document.getElementById('upload-progress-area');
  progressArea.style.display = 'flex';

  const steps = ['step-upload', 'step-parse', 'step-segment', 'step-convert'];
  const labels = ['업로드 중...', 'PDF 분석 중...', 'AI 분절 중...', 'MD 변환 중...'];
  const dones  = ['완료', '완료', '완료', '완료'];
  const delays = [800, 1200, 2000, 1000];

  let progress = 0;
  const bar = document.getElementById('main-progress');
  let stepIdx = 0;

  function runStep() {
    if (stepIdx >= steps.length) {
      // EVT-UPLOAD-005: 분절 완료
      bar.style.width = '100%';
      toast(`"${fileName}" 분절 완료! 에디터로 이동합니다.`, 'success');
      setTimeout(() => {
        openDocument('doc-new', fileName.replace('.pdf', ''));
        progressArea.style.display = 'none';
        document.getElementById('dropzone').style.display = '';
      }, 1000);
      return;
    }

    const stepEl = document.getElementById(steps[stepIdx]);
    const statusEl = document.getElementById(`${steps[stepIdx]}-status`);

    // 이전 스텝 완료
    if (stepIdx > 0) {
      const prevEl = document.getElementById(steps[stepIdx - 1]);
      prevEl.classList.remove('active');
      prevEl.classList.add('done');
      document.getElementById(`${steps[stepIdx - 1]}-status`).textContent = dones[stepIdx - 1];
    }

    stepEl.classList.add('active');
    statusEl.textContent = labels[stepIdx];

    const target = ((stepIdx + 1) / steps.length) * 100;
    bar.style.width = target + '%';

    stepIdx++;
    state.uploadTimer = setTimeout(runStep, delays[stepIdx - 1]);
  }
  runStep();
}

// EVT-UPLOAD-003: 업로드 취소
function cancelUpload() {
  showModal(
    '업로드를 취소하시겠습니까?',
    '진행 중인 작업이 중단됩니다.',
    '취소',
    () => {
      if (state.uploadTimer) clearTimeout(state.uploadTimer);
      document.getElementById('upload-progress-area').style.display = 'none';
      document.getElementById('dropzone').style.display = '';
      document.querySelectorAll('.progress-step').forEach(s => {
        s.classList.remove('active', 'done');
        const status = s.querySelector('.step-status');
        if (status) status.textContent = '대기 중';
      });
      document.getElementById('main-progress').style.width = '0%';
      toast('업로드 취소됨', 'warning');
    }
  );
}

// ── ML 검토 이벤트 ────────────────────────────

// EVT-REVIEW-001: 승인
function approveReview(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.style.transition = 'opacity 0.3s, transform 0.3s';
  card.style.opacity = '0';
  card.style.transform = 'translateX(12px)';
  setTimeout(() => {
    card.remove();
    toast('승인 완료 · 파인튜닝 후보에 추가됨', 'success');
  }, 300);
}

// EVT-REVIEW-002: 거부
function rejectReview(cardId) {
  showModal(
    '쌍데이터를 거부할까요?',
    '거부된 데이터는 아카이브로 이동됩니다.',
    '거부',
    () => {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.style.transition = 'opacity 0.3s, transform 0.3s';
      card.style.opacity = '0';
      card.style.transform = 'translateX(-12px)';
      setTimeout(() => { card.remove(); toast('거부 처리됨 · 아카이브로 이동', 'warning'); }, 300);
    }
  );
}

// EVT-REVIEW-003: 건너뛰기
function skipReview(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.style.transition = 'opacity 0.2s';
  card.style.opacity = '0.4';
  setTimeout(() => { card.style.opacity = '1'; toast('다음 검토 시 다시 표시됩니다.', 'info'); }, 200);
}

// EVT-REVIEW-005: 일괄 승인
function batchApprove() {
  const cards = document.querySelectorAll('.review-card');
  if (!cards.length) { toast('검토할 항목이 없습니다.', 'info'); return; }
  showModal(
    `${cards.length}건을 일괄 승인할까요?`,
    '모든 대기 항목이 파인튜닝 후보에 추가됩니다.',
    `${cards.length}건 승인`,
    () => {
      cards.forEach((card, i) => {
        setTimeout(() => {
          card.style.transition = 'opacity 0.3s';
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 300);
        }, i * 150);
      });
      setTimeout(() => toast(`${cards.length}건 일괄 승인 완료`, 'success'), cards.length * 150 + 400);
    }
  );
}

// EVT-REVIEW-006: 필터
function dummyFilter(select) {
  toast(`필터: ${select.value}`, 'info');
}

// ── 설정 이벤트 ───────────────────────────────

// EVT-SETTINGS-001: API 키 저장
function saveSettings() {
  toast('설정 저장 완료', 'success');
}

// EVT-SETTINGS-002: API 키 삭제
function clearApiKey(provider) {
  showModal(
    `${provider.toUpperCase()} API 키를 삭제할까요?`,
    '키를 삭제하면 해당 모델을 사용할 수 없습니다.',
    '삭제',
    () => { toast(`${provider.toUpperCase()} API 키 삭제됨`, 'warning'); }
  );
}

// EVT-SETTINGS-003: API 키 테스트
function testApiKey(provider) {
  toast(`${provider.toUpperCase()} API 연결 테스트 중...`, 'info');
  setTimeout(() => toast(`✓ ${provider.toUpperCase()} API 연결 성공`, 'success'), 1200);
}

// EVT-SETTINGS-005: 초기화
function resetSettings() {
  showModal(
    '설정을 초기화할까요?',
    '모든 설정이 기본값으로 되돌아갑니다.',
    '초기화',
    () => { toast('설정 초기화 완료', 'warning'); }
  );
}

// EVT-SETTINGS-006: 취소
function closeSettings() {
  const editorTab = state.openTabs.find(t => t.id === 'editor');
  switchTab(editorTab ? 'editor' : 'welcome');
}

// ── 동기화 ────────────────────────────────────

// EVT-EDITOR-006: 수동 동기화
function dummySync() {
  setSyncStatus('syncing');
  toast('동기화 시작...', 'info');
  setTimeout(() => {
    setSyncStatus('synced');
    toast('동기화 완료', 'success');
  }, 1500);
}

function setSyncStatus(status) {
  state.syncStatus = status;
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-sync-text');
  if (!dot || !text) return;

  dot.className = 'status-dot';
  const map = {
    synced:  { cls: 'synced',  label: '동기화됨' },
    pending: { cls: 'pending', label: '동기화 대기' },
    syncing: { cls: 'pending', label: '동기화 중...' },
    error:   { cls: 'error',   label: '동기화 오류' },
    offline: { cls: '',        label: '오프라인' },
  };
  const s = map[status] || map.synced;
  if (s.cls) dot.classList.add(s.cls);
  text.textContent = s.label;
}

// ── 검색 (더미) ───────────────────────────────
// EVT-DOCS-004
const docs = [
  { id: 'doc-001', title: '2024 1학기 수업계획서', meta: '블록 24개' },
  { id: 'doc-002', title: '3월 교육자료_수학',    meta: '블록 18개' },
  { id: 'doc-003', title: '과학 실험 지도안',      meta: '블록 31개' },
  { id: 'doc-004', title: '1월 교육계획서',        meta: '블록 12개' },
  { id: 'doc-005', title: '2월 수업지도안',        meta: '블록 19개' },
];

let searchTimer = null;
function dummySearch(input) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = input.value.trim().toLowerCase();
    const results = document.getElementById('search-results');
    if (!q) { results.innerHTML = '<div class="search-hint">검색어를 입력하세요</div>'; return; }
    const matched = docs.filter(d => d.title.toLowerCase().includes(q));
    if (!matched.length) {
      results.innerHTML = '<div class="search-hint">결과 없음</div>';
      return;
    }
    results.innerHTML = matched.map(d => {
      const hi = d.title.replace(new RegExp(`(${q})`, 'gi'), '<span class="search-highlight">$1</span>');
      return `<div class="search-result-item" onclick="openDocument('${d.id}','${d.title}')">
        <div class="search-result-title">${hi}</div>
        <div class="search-result-meta">${d.meta}</div>
      </div>`;
    }).join('');
  }, 300);
}

// ── 키보드 단축키 ─────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', e => {
    const isCtrl = e.ctrlKey || e.metaKey;
    // EVT-EDITOR-001: Ctrl+S 저장
    if (isCtrl && e.key === 's') {
      e.preventDefault();
      if (state.currentView === 'editor') saveDocument();
    }
    // EVT-EDITOR-004: Ctrl+Z 되돌리기
    if (isCtrl && e.key === 'z' && !e.shiftKey) {
      if (state.currentView === 'editor') dummyUndo();
    }
    // EVT-EDITOR-005: Ctrl+Y / Ctrl+Shift+Z 다시실행
    if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      if (state.currentView === 'editor') dummyRedo();
    }
    // EVT-CMN-005: ESC 모달 닫기
    if (e.key === 'Escape') closeModal();
  });

  // EVT-CMN-007: 앱 종료 시도 (데스크탑 시뮬레이션)
  window.addEventListener('beforeunload', e => {
    if (state.isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ── 상태바 ────────────────────────────────────
function updateStatusBar() {
  const docInfo = document.getElementById('status-doc-info');
  if (docInfo) {
    docInfo.textContent = state.currentView === 'editor'
      ? `블록 ${state.blockCount}개`
      : '';
  }
}

// ── 모달 ─────────────────────────────────────
function showModal(title, body, confirmLabel, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-confirm-btn').textContent = confirmLabel;
  state.modalCallback = onConfirm;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  state.modalCallback = null;
}

function modalConfirm() {
  if (state.modalCallback) state.modalCallback();
  closeModal();
}

// ── 블록 접기/펴기 ───────────────────────────
function initFoldButtons() {
  document.querySelectorAll('.sbg-first').forEach(firstLine => {
    const gutter = firstLine.closest('.source-block-gutter');
    // 멀티라인(sbg-line 2개 이상)인 경우에만 접기 버튼 추가
    if (!gutter || gutter.querySelectorAll('.sbg-line').length < 2) return;

    const btn = document.createElement('button');
    btn.className = 'sbg-fold';
    btn.textContent = '▾';
    btn.title = '접기 / 펴기';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.source-block-row, .preview-block-row');
      const folded = row.classList.toggle('folded');
      btn.textContent = folded ? '▸' : '▾';
    });
    firstLine.prepend(btn);
  });
}

// ── 로케이션 바 ───────────────────────────────
function scrollToTop() {
  const editor = document.getElementById('block-editor');
  if (editor) editor.scrollTop = 0;
}

// ── 토스트 ────────────────────────────────────
let toastTimer = null;
function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `toast ${type} show`;
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2800);
}
