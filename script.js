/* ============================================================
   나의 유튜브 서재 v2 - 스크립트
   - 영상 데이터를 브라우저 localStorage에 저장
   - 카테고리 필터링, 검색, 추가/편집/삭제, 클릭 시 재생
   - (v2.2: 관리자 모드 - 비밀번호 게이트)
   - (v2.3: 데이터 백업/복원 - JSON 내보내기/가져오기)
   ============================================================ */


/* ============================================================
   1. 데이터 관리 (localStorage 저장 / 로드)
   ============================================================ */

// localStorage에 저장할 때 쓰는 키 이름
const STORAGE_KEY = 'myYoutubeLibrary_v1';

// 처음 방문 시 보여줄 샘플 데이터
const sampleData = [
  {
    id: 'sample1',
    videoId: 'jNQXAC9IVRw',
    title: 'Me at the zoo',
    channel: 'jawed',
    category: '역사적 순간',
    note: '유튜브 최초의 영상. 19초밖에 안 되는 이 짧은 클립이 어떻게 세상을 바꿨는지 생각하면 묘한 기분이 든다.',
    createdAt: Date.now()
  }
];

// 전역 상태
let library = loadLibrary();    // 영상 목록 배열
let currentCategory = '전체';   // 현재 선택된 카테고리
let currentSearch = '';         // 현재 검색어 (소문자 변환 전 원본)
let editingId = null;           // 편집 중인 영상 id (없으면 null = 새로 추가 모드)

// localStorage에서 영상 목록을 읽어옴 (없거나 깨졌으면 샘플 데이터)
function loadLibrary() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    // JSON이 깨져있으면 무시하고 샘플로 폴백
  }
  return [...sampleData];
}

// 현재 영상 목록을 localStorage에 저장
function saveLibrary() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch (e) {
    alert('저장에 실패했어요. 브라우저 설정을 확인해주세요.');
  }
}


/* ============================================================
   2. 유틸리티 - 디바운스 & 검색 매칭 & 날짜 포맷
   ============================================================ */

/**
 * debounce(fn, ms): 마지막 호출 후 ms 동안 추가 호출이 없을 때만 fn을 실행.
 */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * matchesSearch(video, query): 영상이 검색어와 매치되는지 검사.
 * 검색 대상 4개 필드(title / channel / note / category) 중 하나라도 포함하면 true.
 */
function matchesSearch(video, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [video.title, video.channel, video.note, video.category]
    .filter(Boolean)
    .some(field => field.toLowerCase().includes(q));
}

/**
 * formatDate(date): Date 객체를 'YYYY-MM-DD' 문자열로 (백업 파일명용).
 */
function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}


/* ============================================================
   3. 유튜브 URL → videoId 추출
   ============================================================ */
function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}


/* ============================================================
   4. 렌더링 - 헤더 메타 줄
   ============================================================ */
function renderMeta() {
  const meta = document.getElementById('metaRow');
  if (!meta) return;
  const count = library.length;
  meta.innerHTML = `
    <span>Vol. 03</span>
    <span class="pip"></span>
    <span>${count} ${count === 1 ? 'Film' : 'Films'}</span>
    <span class="pip"></span>
    <span>Spring, 2026</span>
  `;
}


/* ============================================================
   5. 렌더링 - 카테고리 탭
   ============================================================ */
function renderCategories() {
  const nav = document.getElementById('categories');
  const searchFiltered = library.filter(v => matchesSearch(v, currentSearch));
  const categories = ['전체', ...new Set(library.map(v => v.category).filter(Boolean))];

  nav.innerHTML = categories.map(cat => {
    const count = cat === '전체'
      ? searchFiltered.length
      : searchFiltered.filter(v => v.category === cat).length;
    const active = cat === currentCategory ? 'active' : '';
    const ariaSelected = cat === currentCategory ? 'true' : 'false';
    return `<button class="cat-btn ${active}" role="tab" aria-selected="${ariaSelected}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}<span class="count">(${count})</span></button>`;
  }).join('');

  nav.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      renderCategories();
      renderVideos();
    });
  });

  const datalist = document.getElementById('categoryList');
  const uniqueCats = [...new Set(library.map(v => v.category).filter(Boolean))];
  datalist.innerHTML = uniqueCats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}


/* ============================================================
   6. 렌더링 - 영상 카드 그리드
   ============================================================ */

const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');

  const filtered = library
    .filter(v => currentCategory === '전체' || v.category === currentCategory)
    .filter(v => matchesSearch(v, currentSearch));

  if (filtered.length === 0) {
    empty.textContent = currentSearch
      ? '찾으시는 영상이 책장에 없어요. 다른 키워드로 찾아보세요.'
      : '이 책장은 아직 비어있어요. 첫 번째 영상을 더해보세요.';
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';

  grid.innerHTML = filtered.map((video, i) => `
    <article class="video-card" data-id="${video.id}" style="animation-delay: ${i * 0.05}s">
      <div class="thumbnail-wrapper" data-video-id="${video.videoId}">
        <img src="https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg" alt="${escapeHtml(video.title)}" loading="lazy">
        <button class="play-icon" type="button" aria-label="재생">
          ${PLAY_ICON_SVG}
        </button>
      </div>
      <div class="card-body">
        ${video.category ? `<div class="card-category">${escapeHtml(video.category)}</div>` : ''}
        <h3 class="card-title">${escapeHtml(video.title)}</h3>
        <div class="card-channel">${escapeHtml(video.channel || '')}</div>
        ${video.note ? `
          <div class="card-note">
            <span class="card-note-text">${escapeHtml(video.note)}</span>
          </div>
        ` : ''}
        <div class="card-actions">
          <button class="card-btn edit-btn" data-id="${video.id}">편집</button>
          <button class="card-btn delete delete-btn" data-id="${video.id}">삭제</button>
        </div>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.thumbnail-wrapper').forEach(wrapper => {
    wrapper.addEventListener('click', () => {
      const vid = wrapper.dataset.videoId;
      wrapper.classList.add('playing');
      wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    });
  });

  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('이 영상을 서재에서 빼시겠어요?')) {
        deleteVideo(id);
      }
    });
  });
}


/* ============================================================
   7. HTML 이스케이프 (XSS 방지)
   ============================================================ */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}


/* ============================================================
   8. 모달 - 열기 / 닫기 (영상 추가/편집)
   ============================================================ */
function openModal(id = null) {
  editingId = id;
  const modal = document.getElementById('modalBackdrop');
  const title = document.getElementById('modalTitle');

  if (id) {
    const video = library.find(v => v.id === id);
    if (!video) return;
    title.textContent = '영상 편집하기';
    document.getElementById('urlInput').value      = `https://www.youtube.com/watch?v=${video.videoId}`;
    document.getElementById('titleInput').value    = video.title || '';
    document.getElementById('channelInput').value  = video.channel || '';
    document.getElementById('categoryInput').value = video.category || '';
    document.getElementById('noteInput').value     = video.note || '';
  } else {
    title.textContent = '새 영상 더하기';
    document.getElementById('urlInput').value      = '';
    document.getElementById('titleInput').value    = '';
    document.getElementById('channelInput').value  = '';
    document.getElementById('categoryInput').value = currentCategory !== '전체' ? currentCategory : '';
    document.getElementById('noteInput').value     = '';
  }

  modal.classList.add('active');
  setTimeout(() => document.getElementById('urlInput').focus(), 100);
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
  editingId = null;
}


/* ============================================================
   9. 영상 저장 (추가 또는 편집)
   ============================================================ */
function saveVideo() {
  const url      = document.getElementById('urlInput').value.trim();
  const title    = document.getElementById('titleInput').value.trim();
  const channel  = document.getElementById('channelInput').value.trim();
  const category = document.getElementById('categoryInput').value.trim();
  const note     = document.getElementById('noteInput').value.trim();

  const videoId = extractVideoId(url);
  if (!videoId) {
    alert('올바른 유튜브 URL을 입력해주세요.');
    return;
  }
  if (!title) {
    alert('제목을 입력해주세요.');
    return;
  }

  if (editingId) {
    const idx = library.findIndex(v => v.id === editingId);
    if (idx >= 0) {
      library[idx] = { ...library[idx], videoId, title, channel, category, note };
    }
  } else {
    library.unshift({
      id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      videoId, title, channel, category, note,
      createdAt: Date.now()
    });
  }

  saveLibrary();
  closeModal();
  renderMeta();
  renderCategories();
  renderVideos();
  updateBackupDot();         // 영상 개수 변경 → 백업 점 갱신
}


/* ============================================================
   10. 영상 삭제 (페이드 아웃 → 실제 제거)
   ============================================================ */
function deleteVideo(id) {
  const card = document.querySelector(`.video-card[data-id="${id}"]`);
  if (card) card.classList.add('deleting');

  setTimeout(() => {
    library = library.filter(v => v.id !== id);

    if (currentCategory !== '전체' && !library.some(v => v.category === currentCategory)) {
      currentCategory = '전체';
    }

    saveLibrary();
    renderMeta();
    renderCategories();
    renderVideos();
    updateBackupDot();        // 영상 개수 변경 → 백업 점 갱신
  }, 300);
}


/* ============================================================
   11. 검색 이벤트 (200ms 디바운스)
   ============================================================ */
const searchInput   = document.getElementById('searchInput');
const searchClear   = document.getElementById('searchClear');
const searchWrapper = document.getElementById('searchWrapper');

const applySearch = debounce((value) => {
  currentSearch = value;
  renderCategories();
  renderVideos();
}, 200);

searchInput.addEventListener('input', () => {
  const value = searchInput.value;
  searchWrapper.classList.toggle('has-value', value.length > 0);
  applySearch(value);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchWrapper.classList.remove('has-value');
  currentSearch = '';
  renderCategories();
  renderVideos();
  searchInput.focus();
});


/* ============================================================
   12. 모달 이벤트 (열기/닫기, ESC, 단축키)
   ============================================================ */

document.getElementById('addFab').addEventListener('click', () => openModal());
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveVideo);

document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeModal();
});

// 키보드 이벤트 (전역)
document.addEventListener('keydown', (e) => {
  // ESC → 모든 모달 닫기 (영상/비밀번호/가져오기)
  if (e.key === 'Escape') {
    closeModal();
    closePasswordModal();
    closeImportModal();
  }
  // Ctrl + Shift + A → 비밀번호 모달 열기 (관리자 모드 진입)
  if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    e.preventDefault();
    openPasswordModal();
  }
});


/* ============================================================
   13. URL 입력칸에서 포커스를 빼면 → oEmbed로 제목/채널 자동 채우기
   ============================================================ */
document.getElementById('urlInput').addEventListener('blur', async () => {
  const url     = document.getElementById('urlInput').value.trim();
  const videoId = extractVideoId(url);
  const titleInput   = document.getElementById('titleInput');
  const channelInput = document.getElementById('channelInput');

  if (videoId && !titleInput.value && !channelInput.value) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (!titleInput.value)   titleInput.value   = data.title || '';
        if (!channelInput.value) channelInput.value = data.author_name || '';
      }
    } catch (e) {
      // oEmbed 실패해도 무시 (사용자가 수동으로 입력 가능)
    }
  }
});


/* ============================================================
   14. 관리자 모드 (방문자 모드 ↔ 관리자 모드 토글)

   ⚠️ 보안 알림:
   클라이언트 사이드 게이트일 뿐입니다. script.js가 공개되므로
   누구나 비밀번호를 볼 수 있고 콘솔로 우회도 가능합니다.
   ============================================================ */

const ADMIN_PASSWORD = 'library2026';                       // ← 비밀번호 (바꾸려면 여기만)
const ADMIN_STORAGE_KEY = 'myYoutubeLibrary_admin';
let isAdmin = false;

function checkAdminMode() {
  isAdmin = sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  document.body.classList.toggle('admin-mode', isAdmin);
}

function enterAdminMode() {
  isAdmin = true;
  sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
  document.body.classList.add('admin-mode');
  updateBackupDot();        // 진입 시 백업 점도 갱신
}

function exitAdminMode() {
  sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete('admin');
  window.history.replaceState({}, '', url);
  window.location.reload();
}

function openPasswordModal() {
  if (isAdmin) return;
  const modal = document.getElementById('passwordModalBackdrop');
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');
  input.value = '';
  error.textContent = '';
  input.classList.remove('shake');
  modal.classList.add('active');
  setTimeout(() => input.focus(), 100);
}

function closePasswordModal() {
  document.getElementById('passwordModalBackdrop').classList.remove('active');
}

function submitPassword() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');

  if (input.value === ADMIN_PASSWORD) {
    enterAdminMode();
    closePasswordModal();
  } else {
    input.classList.add('shake');
    error.textContent = '비밀번호가 맞지 않아요.';
    setTimeout(() => input.classList.remove('shake'), 400);
    input.select();
  }
}

document.getElementById('passwordSubmitBtn').addEventListener('click', submitPassword);
document.getElementById('passwordCancelBtn').addEventListener('click', closePasswordModal);

document.getElementById('passwordInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitPassword();
  } else if (e.key !== 'Escape') {
    document.getElementById('passwordError').textContent = '';
  }
});

document.getElementById('passwordModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'passwordModalBackdrop') closePasswordModal();
});

document.getElementById('adminLogout').addEventListener('click', exitAdminMode);


/* ============================================================
   15. 데이터 백업/복원 (JSON 내보내기/가져오기)
   - 다른 컴퓨터로 데이터를 옮기는 용도 (집 ↔ 회사)
   - 내보내기: 현재 library를 JSON 파일로 다운로드
   - 가져오기: JSON 파일 선택 → 미리보기 → 병합 또는 덮어쓰기
   ============================================================ */

const BACKUP_THRESHOLD = 10;       // 영상 N개 이상이면 백업 권장 점 표시
let pendingImport = null;          // 가져오기 대기 중인 영상 배열 (모달 열려 있을 때만)
let pendingImportMeta = null;      // 미리보기에 표시할 파일 메타 정보

/**
 * 영상 ≥ BACKUP_THRESHOLD이면 내보내기 버튼 옆에 백업 권장 점 표시
 */
function updateBackupDot() {
  const dot = document.getElementById('backupDot');
  if (!dot) return;
  dot.classList.toggle('show', library.length >= BACKUP_THRESHOLD);
}

/**
 * 내보내기: 현재 library를 JSON 파일로 다운로드
 * 파일명: youtube-library-backup-YYYY-MM-DD.json
 */
function exportToJson() {
  const now = new Date();
  const data = {
    exportedAt: now.toISOString(),
    version: '1.0',
    videoCount: library.length,
    videos: library
  };

  // JSON 문자열 (들여쓰기 2칸으로 사람이 읽기 쉽게)
  const json = JSON.stringify(data, null, 2);

  // Blob → 임시 URL → 가짜 <a> 클릭으로 다운로드
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube-library-backup-${formatDate(now)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);          // 메모리 해제
}

/**
 * 가져오기: 사용자가 선택한 파일을 읽고 검증한 후 미리보기 모달 띄움
 */
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // 검증: data.videos가 배열이어야 함
      if (!data || !Array.isArray(data.videos)) {
        alert('영상 데이터가 없어요. (videos 배열이 없거나 잘못된 형식이에요.)');
        return;
      }
      if (data.videos.length === 0) {
        alert('영상 데이터가 없어요. (파일은 비어있어요.)');
        return;
      }

      // 미리보기에 사용할 정보 저장 후 모달 열기
      pendingImport = data.videos;
      pendingImportMeta = {
        fileName: file.name,
        exportedAt: data.exportedAt || null,
        version: data.version || null
      };
      openImportPreview();
    } catch (err) {
      alert('파일이 손상되었거나 형식이 맞지 않아요. (JSON으로 읽을 수 없어요.)');
    }
  };
  reader.onerror = () => {
    alert('파일을 읽는 데 실패했어요.');
  };
  reader.readAsText(file);
}

/**
 * 가져오기 미리보기 모달 - 영상 개수와 파일 정보 표시
 */
function openImportPreview() {
  const modal = document.getElementById('importModalBackdrop');
  const summary = document.getElementById('importSummary');

  // 파일 메타 정보 (선택)
  let metaLine = '';
  if (pendingImportMeta && pendingImportMeta.exportedAt) {
    const exportedDate = new Date(pendingImportMeta.exportedAt);
    if (!isNaN(exportedDate)) {
      metaLine = `<span class="meta">파일: ${escapeHtml(pendingImportMeta.fileName)} · ${formatDate(exportedDate)} 내보낸 백업</span>`;
    }
  } else if (pendingImportMeta) {
    metaLine = `<span class="meta">파일: ${escapeHtml(pendingImportMeta.fileName)}</span>`;
  }

  summary.innerHTML = `
    <p>이 파일에는 <strong>${pendingImport.length}개</strong>의 영상이 있어요.</p>
    <p>현재 서재에는 <strong>${library.length}개</strong>가 있어요. 어떻게 처리할까요?</p>
    ${metaLine}
  `;

  modal.classList.add('active');
}

/**
 * 가져오기 모달 닫기 + 상태 정리
 */
function closeImportModal() {
  document.getElementById('importModalBackdrop').classList.remove('active');
  pendingImport = null;
  pendingImportMeta = null;
  // 같은 파일을 다시 선택할 수 있도록 file input 초기화
  document.getElementById('importFileInput').value = '';
}

/**
 * 병합: videoId 기준 중복 제거 후 새 영상만 추가
 */
function importMerge() {
  if (!pendingImport) return;
  const existingIds = new Set(library.map(v => v.videoId));
  const newOnes = pendingImport.filter(v => v.videoId && !existingIds.has(v.videoId));
  library = [...newOnes, ...library];
  finalizeImport(`${newOnes.length}개의 새 영상을 가져왔어요. (중복 ${pendingImport.length - newOnes.length}개는 건너뛰었어요.)`);
}

/**
 * 덮어쓰기: 한 번 더 confirm 후 전체 교체
 */
function importReplace() {
  if (!pendingImport) return;
  const ok = confirm(
    `현재 영상 ${library.length}개를 모두 삭제하고 새 ${pendingImport.length}개로 교체합니다.\n\n계속하시겠어요?`
  );
  if (!ok) return;
  library = [...pendingImport];
  finalizeImport(`${pendingImport.length}개 영상으로 교체했어요.`);
}

/**
 * 가져오기 마무리: 저장 + 모달 닫기 + 모든 UI 갱신 + 알림
 */
function finalizeImport(message) {
  saveLibrary();
  closeImportModal();
  renderMeta();
  renderCategories();
  renderVideos();
  updateBackupDot();
  alert(message);
}

// 내보내기 버튼
document.getElementById('exportBtn').addEventListener('click', exportToJson);

// 가져오기 버튼 → 숨김 file input 트리거
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});

// 파일 선택 시
document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
});

// 가져오기 모달의 버튼들
document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
document.getElementById('importMergeBtn').addEventListener('click', importMerge);
document.getElementById('importReplaceBtn').addEventListener('click', importReplace);

// 모달 백드롭 클릭 → 닫기
document.getElementById('importModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'importModalBackdrop') closeImportModal();
});


/* ============================================================
   16. 초기 렌더 + 관리자 모드 체크
   ============================================================ */
saveLibrary();        // 첫 방문 시 샘플 데이터를 localStorage에도 기록
checkAdminMode();     // sessionStorage 기준으로 관리자 모드 복원
renderMeta();
renderCategories();
renderVideos();
updateBackupDot();    // 영상 개수 기준 백업 점 갱신

// URL에 ?admin=true 있으면 비밀번호 모달 자동 열기
if (new URLSearchParams(window.location.search).get('admin') === 'true') {
  openPasswordModal();
}
