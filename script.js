/* ============================================================
   나의 유튜브 서재 v2 - 스크립트
   - 영상 데이터를 브라우저 localStorage에 저장
   - 카테고리 필터링, 검색, 추가/편집/삭제, 클릭 시 재생
   - (v2.2: 관리자 모드 추가 - 비밀번호 게이트, sessionStorage)
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
   2. 유틸리티 - 디바운스 & 검색 매칭
   ============================================================ */

/**
 * debounce(fn, ms): 마지막 호출 후 ms 동안 추가 호출이 없을 때만 fn을 실행.
 * 검색창에 빠르게 타이핑할 때 매 키 입력마다 필터링하지 않도록 사용.
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
 * 검색 대상 4개 필드(title / channel / note / category) 중
 * 하나라도 검색어를 포함하면 true. 대소문자 무시.
 */
function matchesSearch(video, query) {
  if (!query) return true;                                // 검색어 없으면 모두 통과
  const q = query.toLowerCase();
  return [video.title, video.channel, video.note, video.category]
    .filter(Boolean)                                      // null/undefined 제외
    .some(field => field.toLowerCase().includes(q));
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
   4. 렌더링 - 헤더 메타 줄 ("Vol. 03 · N Films · Spring, 2026")
   - 메타는 전체 라이브러리 기준 (검색에 영향 받지 않음)
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
   - 카테고리 목록은 전체 라이브러리 기준 (탭 자체는 사라지지 않음)
   - 카운트(숫자)는 검색을 반영해 줄어듦
   ============================================================ */
function renderCategories() {
  const nav = document.getElementById('categories');

  // 검색을 적용한 영상 목록 (카운트 계산용)
  const searchFiltered = library.filter(v => matchesSearch(v, currentSearch));

  // '전체' + 영상에 등록된 모든 카테고리 (중복 제거)
  const categories = ['전체', ...new Set(library.map(v => v.category).filter(Boolean))];

  nav.innerHTML = categories.map(cat => {
    const count = cat === '전체'
      ? searchFiltered.length
      : searchFiltered.filter(v => v.category === cat).length;
    const active = cat === currentCategory ? 'active' : '';
    const ariaSelected = cat === currentCategory ? 'true' : 'false';
    return `<button class="cat-btn ${active}" role="tab" aria-selected="${ariaSelected}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}<span class="count">(${count})</span></button>`;
  }).join('');

  // 카테고리 버튼 클릭 → 필터 변경 (검색어는 유지)
  nav.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      renderCategories();
      renderVideos();
    });
  });

  // 모달의 카테고리 입력칸 자동완성용 datalist 갱신
  const datalist = document.getElementById('categoryList');
  const uniqueCats = [...new Set(library.map(v => v.category).filter(Boolean))];
  datalist.innerHTML = uniqueCats.map(c => `<option value="${escapeHtml(c)}">`).join('');
}


/* ============================================================
   6. 렌더링 - 영상 카드 그리드
   - 카테고리 + 검색 AND 조건으로 필터링
   - 빈 상태 메시지는 검색 여부에 따라 분기
   - 편집/삭제 버튼은 마크업엔 항상 포함, 가시성은 CSS가 제어
     (body.admin-mode일 때만 보임)
   ============================================================ */

// 재생 버튼 안에 들어갈 SVG 아이콘 (▶)
const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');

  // 카테고리 + 검색 AND 조건으로 필터
  const filtered = library
    .filter(v => currentCategory === '전체' || v.category === currentCategory)
    .filter(v => matchesSearch(v, currentSearch));

  // 결과가 없으면 빈 상태 메시지 표시 (검색 여부에 따라 다른 문구)
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

  // 각 영상마다 카드 HTML 생성 (등장 애니메이션은 i*0.05초씩 지연)
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

  // 썸네일 클릭 → 그 자리에 iframe을 끼워넣어 영상 재생
  grid.querySelectorAll('.thumbnail-wrapper').forEach(wrapper => {
    wrapper.addEventListener('click', () => {
      const vid = wrapper.dataset.videoId;
      wrapper.classList.add('playing');
      wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    });
  });

  // 편집 버튼 클릭 → 모달 열기
  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(btn.dataset.id);
    });
  });

  // 삭제 버튼 클릭 → 확인 후 삭제
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
    // 편집 모드: 기존 영상 정보를 입력칸에 채워넣음
    const video = library.find(v => v.id === id);
    if (!video) return;
    title.textContent = '영상 편집하기';
    document.getElementById('urlInput').value      = `https://www.youtube.com/watch?v=${video.videoId}`;
    document.getElementById('titleInput').value    = video.title || '';
    document.getElementById('channelInput').value  = video.channel || '';
    document.getElementById('categoryInput').value = video.category || '';
    document.getElementById('noteInput').value     = video.note || '';
  } else {
    // 추가 모드: 입력칸 비우기 (단, 카테고리는 현재 선택된 값으로 미리 채움)
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

  // 유효성 검사
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
    // 편집 모드: 기존 항목 업데이트
    const idx = library.findIndex(v => v.id === editingId);
    if (idx >= 0) {
      library[idx] = { ...library[idx], videoId, title, channel, category, note };
    }
  } else {
    // 추가 모드: 새 항목을 맨 앞에 (unshift)
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
}


/* ============================================================
   10. 영상 삭제 (페이드 아웃 → 실제 제거)
   ============================================================ */
function deleteVideo(id) {
  // 먼저 카드에 .deleting 클래스를 줘서 사라지는 애니메이션 실행
  const card = document.querySelector(`.video-card[data-id="${id}"]`);
  if (card) card.classList.add('deleting');

  // 애니메이션이 끝난 뒤(300ms) 실제로 데이터에서 제거
  setTimeout(() => {
    library = library.filter(v => v.id !== id);

    // 현재 카테고리에 영상이 더 이상 없다면 '전체'로 되돌림
    if (currentCategory !== '전체' && !library.some(v => v.category === currentCategory)) {
      currentCategory = '전체';
    }

    saveLibrary();
    renderMeta();
    renderCategories();
    renderVideos();
  }, 300);
}


/* ============================================================
   11. 검색 이벤트 (200ms 디바운스)
   ============================================================ */
const searchInput   = document.getElementById('searchInput');
const searchClear   = document.getElementById('searchClear');
const searchWrapper = document.getElementById('searchWrapper');

// 디바운스된 실제 필터링 함수 (200ms)
const applySearch = debounce((value) => {
  currentSearch = value;
  renderCategories();
  renderVideos();
}, 200);

// 입력 이벤트: X 버튼 표시는 즉시, 필터링은 디바운스
searchInput.addEventListener('input', () => {
  const value = searchInput.value;
  searchWrapper.classList.toggle('has-value', value.length > 0);
  applySearch(value);
});

// X 버튼 클릭 → 입력 비우고 즉시 검색 초기화 (디바운스 우회)
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
   - ESC: 영상 모달 + 비밀번호 모달 둘 다 닫기
   - Ctrl+Shift+A: 비밀번호 모달 열기 (이미 관리자면 무시됨)
   ============================================================ */

// FAB(+) 버튼 → 새 영상 모달 열기
document.getElementById('addFab').addEventListener('click', () => openModal());

// 모달의 취소/저장 버튼
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveVideo);

// 모달 바깥(어두운 배경) 클릭 → 닫기
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeModal();
});

// 키보드 이벤트 (전역)
document.addEventListener('keydown', (e) => {
  // ESC → 두 모달 모두 닫기
  if (e.key === 'Escape') {
    closeModal();
    closePasswordModal();
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
   이 비밀번호 게이트는 클라이언트 사이드 정적 사이트용이라
   "방문자가 실수로 +버튼을 누르는 걸 막는" 가벼운 게이트일 뿐입니다.
   누구나 script.js를 보면 비밀번호를 알 수 있고, 콘솔에서 우회도 가능.
   진짜 보안이 필요하면 백엔드 + 진짜 인증(Firebase Auth 등)이 필요해요.
   ============================================================ */

const ADMIN_PASSWORD = 'library2026';                       // ← 비밀번호 (바꾸려면 여기만)
const ADMIN_STORAGE_KEY = 'myYoutubeLibrary_admin';
let isAdmin = false;

// 페이지 로드 시 관리자 상태 복원 (sessionStorage 기준)
function checkAdminMode() {
  isAdmin = sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  document.body.classList.toggle('admin-mode', isAdmin);
}

// 관리자 모드 진입 (성공 시)
function enterAdminMode() {
  isAdmin = true;
  sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
  document.body.classList.add('admin-mode');
}

// 관리자 모드 종료 (로그아웃)
// 1) sessionStorage 제거
// 2) URL의 ?admin=true 파라미터도 정리 (없으면 새로고침 후 모달이 또 뜸)
// 3) 새로고침으로 깔끔한 상태 보장
function exitAdminMode() {
  sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete('admin');
  window.history.replaceState({}, '', url);
  window.location.reload();
}

// 비밀번호 모달 - 열기 / 닫기
function openPasswordModal() {
  if (isAdmin) return;                                      // 이미 관리자면 무시
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

// 비밀번호 검증
function submitPassword() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');

  if (input.value === ADMIN_PASSWORD) {
    enterAdminMode();
    closePasswordModal();
  } else {
    // 흔들림 애니메이션 + 에러 메시지
    input.classList.add('shake');
    error.textContent = '비밀번호가 맞지 않아요.';
    setTimeout(() => input.classList.remove('shake'), 400);
    input.select();
  }
}

// 비밀번호 모달 이벤트 바인딩
document.getElementById('passwordSubmitBtn').addEventListener('click', submitPassword);
document.getElementById('passwordCancelBtn').addEventListener('click', closePasswordModal);

// Enter 키 → 제출, 다른 키 입력 시 에러 메시지 자동 제거
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitPassword();
  } else if (e.key !== 'Escape') {
    document.getElementById('passwordError').textContent = '';
  }
});

// 모달 백드롭 클릭 → 닫기
document.getElementById('passwordModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'passwordModalBackdrop') closePasswordModal();
});

// 배지의 "로그아웃" 버튼
document.getElementById('adminLogout').addEventListener('click', exitAdminMode);


/* ============================================================
   15. 초기 렌더 + 관리자 모드 체크
   ============================================================ */
saveLibrary();        // 첫 방문 시 샘플 데이터를 localStorage에도 기록
checkAdminMode();     // sessionStorage 기준으로 관리자 모드 복원
renderMeta();
renderCategories();
renderVideos();

// URL에 ?admin=true 있으면 비밀번호 모달 자동 열기
// (이미 관리자면 openPasswordModal 안에서 무시됨)
if (new URLSearchParams(window.location.search).get('admin') === 'true') {
  openPasswordModal();
}
