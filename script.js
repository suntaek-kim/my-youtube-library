/* ============================================================
   나의 유튜브 서재 v2 - 스크립트
   - (Sprint 6 Step 5: Supabase Auth - 회원가입/로그인/로그아웃)
   - (Sprint 6 Step 6: 데이터 저장소를 localStorage → Supabase DB로 전환)
     · 영상 CRUD를 모두 Supabase 'videos' 테이블로
     · 비로그인: 사이트 주인(OWNER_USER_ID)의 영상 표시
     · 로그인: 현재 사용자의 영상 표시 + 편집
     · 기존 localStorage 데이터는 로그인 시 자동 마이그레이션
   ============================================================ */


/* ============================================================
   1. 데이터 관리 (Supabase 'videos' 테이블)
   ============================================================ */

// 옛 localStorage 키 (이제 저장용이 아니라 '마이그레이션 대상'을 찾는 용도)
const STORAGE_KEY = 'myYoutubeLibrary_v1';

// 전역 상태
let library = [];               // 화면에 표시 중인 영상 목록 (Supabase에서 로드)
let currentCategory = '전체';   // 현재 선택된 카테고리
let currentSearch = '';         // 현재 검색어
let editingId = null;           // 편집 중인 영상 id (없으면 null = 새로 추가 모드)
let currentUser = null;         // 로그인한 사용자 (14번 인증 섹션에서 갱신, 비로그인이면 null)

/**
 * fromRow(row): Supabase 행(snake_case)을 앱 내부 형식(camelCase)으로 변환.
 * - DB는 video_id / created_at, 앱 코드는 videoId / createdAt 을 쓰기 때문에
 *   이 함수 하나만 거치면 렌더링·검색 등 나머지 코드는 그대로 둘 수 있음.
 * - id는 문자열로 통일 (기존 코드가 id를 문자열로 다뤘기 때문)
 */
function fromRow(row) {
  return {
    id: String(row.id),
    videoId: row.video_id,
    title: row.title,
    channel: row.channel || '',
    category: row.category || '',
    note: row.note || '',
    createdAt: row.created_at
  };
}

/**
 * handleSupabaseError(error, context): Supabase 오류를 한국어 알림으로 변환.
 */
function handleSupabaseError(error, context) {
  console.error('[Supabase 오류]', context, error);
  const m = (error && error.message) || '';
  let msg;
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) {
    msg = '인터넷 연결을 확인해주세요.';
  } else if ((error && error.code === '42501') || m.includes('row-level security') || m.includes('permission')) {
    msg = '권한이 없어요. (데이터베이스 RLS 정책을 확인해주세요)';
  } else {
    msg = (context || '오류가 발생했어요') + ': ' + (m || '알 수 없는 오류');
  }
  alert(msg);
}

/**
 * loadLibrary(): Supabase에서 영상 목록을 불러와 전역 library에 채움.
 * - 로그인 상태: 현재 사용자(currentUser)의 영상
 * - 비로그인:    사이트 주인(OWNER_USER_ID)의 영상
 * - 둘 다 없으면: 빈 책장
 */
async function loadLibrary() {
  // 누구의 영상을 보여줄지 결정 (로그인 사용자 우선, 없으면 사이트 주인)
  const targetUserId = currentUser?.id || window.OWNER_USER_ID;

  if (!targetUserId) {
    // 주인장도 정해지지 않았고 로그인도 안 됨 → 빈 화면
    library = [];
    return;
  }

  try {
    const { data, error } = await window.supabaseClient
      .from('videos')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });   // 최신 영상이 위로

    if (error) throw error;
    library = (data || []).map(fromRow);
  } catch (e) {
    handleSupabaseError(e, '영상을 불러오지 못했어요');
    library = [];
  }
}

/**
 * refreshLibrary(): 로딩 표시 → 데이터 로드 → 전체 화면 렌더링.
 * 페이지 로드/로그인/로그아웃/저장/삭제 후 호출됨.
 */
async function refreshLibrary() {
  showLoading();
  await loadLibrary();

  // 현재 선택된 카테고리에 영상이 하나도 없으면 '전체'로 되돌림
  if (currentCategory !== '전체' && !library.some(v => v.category === currentCategory)) {
    currentCategory = '전체';
  }

  renderMeta();
  renderCategories();
  renderVideos();
  updateBackupDot();
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
   6. 렌더링 - 영상 카드 그리드 + 로딩 표시
   ============================================================ */

const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

/**
 * showLoading(): 데이터를 불러오는 동안 그리드 영역에 로딩 메시지 표시.
 */
function showLoading() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');
  grid.style.display = 'none';
  empty.style.display = 'block';
  empty.textContent = '📚 책장을 펼치는 중...';
}

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');

  const filtered = library
    .filter(v => currentCategory === '전체' || v.category === currentCategory)
    .filter(v => matchesSearch(v, currentSearch));

  if (filtered.length === 0) {
    // 빈 상태 메시지 (검색 중 / 비로그인 / 진짜 빈 책장 구분)
    if (currentSearch) {
      empty.textContent = '찾으시는 영상이 책장에 없어요. 다른 키워드로 찾아보세요.';
    } else if (!currentUser && !window.OWNER_USER_ID) {
      empty.textContent = '이 책장은 아직 비어있어요.';
    } else {
      empty.textContent = '이 책장은 아직 비어있어요. 첫 번째 영상을 더해보세요.';
    }
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
   9. 영상 저장 (Supabase insert / update)
   - 비로그인: 저장 불가 → 알림 + 인증 모달
   - 추가: insert (user_id 포함)
   - 편집: update (.eq('id', editingId))
   ============================================================ */
async function saveVideo() {
  // 로그인하지 않았으면 저장 불가
  if (!currentUser) {
    alert('영상을 추가하려면 로그인이 필요해요.');
    closeModal();
    openAuthModal();
    return;
  }

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

  // Supabase에 보낼 형식 (snake_case, 빈 값은 null)
  const payload = {
    video_id: videoId,
    title: title,
    channel: channel || null,
    category: category || null,
    note: note || null
  };

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;          // 중복 제출 방지
  try {
    if (editingId) {
      // 편집: 기존 행을 update
      const { error } = await window.supabaseClient
        .from('videos')
        .update(payload)
        .eq('id', editingId);
      if (error) throw error;
    } else {
      // 추가: user_id를 포함해 insert
      const { error } = await window.supabaseClient
        .from('videos')
        .insert({ ...payload, user_id: currentUser.id });
      if (error) throw error;
    }
    closeModal();
    await refreshLibrary();        // 저장 후 최신 데이터로 다시 그림
  } catch (e) {
    handleSupabaseError(e, '영상을 저장하지 못했어요');
  } finally {
    saveBtn.disabled = false;
  }
}


/* ============================================================
   10. 영상 삭제 (Supabase delete)
   ============================================================ */
async function deleteVideo(id) {
  const card = document.querySelector(`.video-card[data-id="${id}"]`);
  if (card) card.classList.add('deleting');   // 페이드 아웃 시작

  try {
    const { error } = await window.supabaseClient
      .from('videos')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await refreshLibrary();
  } catch (e) {
    handleSupabaseError(e, '영상을 삭제하지 못했어요');
    if (card) card.classList.remove('deleting');   // 실패 시 원상복구
  }
}


/* ============================================================
   11. 검색 이벤트 (200ms 디바운스, 메모리 내 필터)
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
   12. 모달 이벤트 (열기/닫기, ESC)
   ============================================================ */

document.getElementById('addFab').addEventListener('click', () => openModal());
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveVideo);

document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeModal();
});

// ESC → 열려 있는 모달 모두 닫기 (영상 / 인증 / 가져오기)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeAuthModal();
    closeImportModal();
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
   14. 사용자 인증 (Supabase Auth) + 데이터 마이그레이션
   ============================================================ */

const auth = window.supabaseClient.auth;   // Supabase Auth 모듈
let authMode = 'login';                     // 인증 모달 모드: 'login' | 'signup'

/* --- 로그인 상태에 따라 body 클래스와 헤더 표시를 갱신 --- */
function updateAuthUI() {
  const loggedIn = !!currentUser;
  document.body.classList.toggle('logged-in', loggedIn);
  if (loggedIn) {
    const name = currentUser.email.split('@')[0];
    document.getElementById('userName').textContent = name;
  }
}

/* --- 현재 화면 모드 판별 ("개인 블로그" 모델) ---
   'visitor'    : 비로그인 — 사이트 주인의 책장을 둘러보기
   'owner'      : 사이트 주인 본인이 로그인 (OWNER_USER_ID와 일치)
   'guest-user' : 다른 사용자가 로그인 — 자기만의 책장 */
function getViewMode() {
  if (!currentUser) return 'visitor';
  if (window.OWNER_USER_ID && currentUser.id === window.OWNER_USER_ID) return 'owner';
  return 'guest-user';
}

/**
 * migrateLocalStorageToSupabase(): 기존 localStorage 영상을 클라우드로 이전.
 * - 로그인 상태에서 페이지 로드/로그인 직후 한 번만 실행
 * - 사용자에게 확인을 받고, 동의하면 현재 사용자 계정으로 insert
 * - 끝나면 옛 데이터는 백업 키로 보관하고 마이그레이션 완료 표시
 */
async function migrateLocalStorageToSupabase() {
  // 이미 마이그레이션 했으면 스킵
  if (localStorage.getItem('migrationDone_v1')) return;

  // 로그인 상태가 아니면 (이전 단계라면) 다음 기회로 미룸
  if (!currentUser) return;

  const localData = localStorage.getItem(STORAGE_KEY);
  if (!localData) {
    localStorage.setItem('migrationDone_v1', 'true');
    return;
  }

  let localVideos;
  try {
    localVideos = JSON.parse(localData);
  } catch (e) {
    localVideos = null;
  }
  if (!localVideos || localVideos.length === 0) {
    localStorage.setItem('migrationDone_v1', 'true');
    return;
  }

  // 사용자에게 확인
  const confirmed = confirm(
    `이전에 쓰던 영상 ${localVideos.length}개가 이 브라우저에 남아 있어요.\n클라우드 책장으로 옮길까요?`
  );
  if (!confirmed) {
    localStorage.setItem('migrationDone_v1', 'true');
    return;
  }

  // 현재 사용자 계정으로 모두 insert
  const videosToInsert = localVideos.map(v => ({
    user_id: currentUser.id,
    video_id: v.videoId,
    title: v.title,
    channel: v.channel || null,
    category: v.category || null,
    note: v.note || null
  }));

  try {
    const { error } = await window.supabaseClient.from('videos').insert(videosToInsert);
    if (error) throw error;
  } catch (e) {
    handleSupabaseError(e, '데이터 이전 중 오류가 발생했어요');
    return;   // 실패 시 migrationDone 표시 안 함 → 다음에 다시 시도
  }

  // 성공: 옛 데이터는 백업 키로 보관 후 원래 키 제거
  localStorage.setItem('myYoutubeLibrary_backup_pre_supabase', localData);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem('migrationDone_v1', 'true');

  alert(`${videosToInsert.length}개 영상을 클라우드로 옮겼어요!`);
}

/* --- 로그인 상태 감시자 ---
   로그인 / 로그아웃 / 페이지 로드 시마다 자동 호출됨.

   ⚠️ 중요: 이 콜백 '안에서' Supabase 데이터 호출(.from(...))을 직접 await하면
   Supabase 내부의 인증 락(lock)과 충돌해 데드락이 발생함 (화면이 멈춤).
   → 데이터 호출은 setTimeout(.., 0)으로 감싸 '콜백이 끝난 다음 틱'에 실행한다.
   콜백 자체는 동기로 즉시 끝나고, 무거운 작업은 분리되어 안전하게 돌아감. */
auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;
  updateAuthUI();
  console.log('[화면 모드]', getViewMode(), currentUser ? `· ${currentUser.email}` : '');

  // Supabase 호출은 콜백 밖(다음 틱)에서 — 데드락 방지
  setTimeout(async () => {
    // 로그인 상태이면 옛 localStorage 데이터 이전 시도 (이미 했으면 내부에서 스킵)
    if (currentUser) {
      await migrateLocalStorageToSupabase();
    }
    // 데이터 (재)로드 + 화면 렌더링
    // - 로그인: 현재 사용자의 영상 / 로그아웃: 사이트 주인의 영상
    await refreshLibrary();
  }, 0);
});

/* --- 인증 모달 - 열기 / 닫기 --- */
function openAuthModal() {
  setAuthMode('login');
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authPasswordConfirm').value = '';
  document.getElementById('authError').textContent = '';
  document.getElementById('authModalBackdrop').classList.add('active');
  setTimeout(() => document.getElementById('authEmail').focus(), 100);
}

function closeAuthModal() {
  document.getElementById('authModalBackdrop').classList.remove('active');
}

/* --- 탭 전환 (로그인 ↔ 회원가입) --- */
function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  document.getElementById('loginTab').classList.toggle('active', !isSignup);
  document.getElementById('signupTab').classList.toggle('active', isSignup);
  document.getElementById('authConfirmGroup').style.display = isSignup ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = isSignup ? '회원가입' : '로그인';
  document.getElementById('authError').textContent = '';
}

/* --- 에러 메시지 표시 (비밀번호 입력칸 흔들림 포함) --- */
function showAuthError(message) {
  document.getElementById('authError').textContent = message;
  const pw = document.getElementById('authPassword');
  pw.classList.add('shake');
  setTimeout(() => pw.classList.remove('shake'), 400);
}

/* --- Supabase Auth 에러 메시지를 한국어로 변환 --- */
function translateAuthError(error) {
  const msg = (error && error.message) || '';
  if (msg.includes('Invalid login credentials'))
    return '이메일 또는 비밀번호가 올바르지 않아요.';
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return '이미 가입된 이메일이에요. 로그인 탭을 이용해주세요.';
  if (msg.includes('Password should be at least'))
    return '비밀번호는 6자 이상이어야 해요.';
  if (msg.includes('Unable to validate email') || msg.includes('invalid format'))
    return '이메일 형식이 올바르지 않아요.';
  if (msg.includes('Email not confirmed'))
    return '이메일 인증이 필요해요. 메일함의 확인 링크를 눌러주세요.';
  return '오류가 발생했어요: ' + msg;
}

/* --- 폼 제출 (로그인 또는 회원가입) --- */
async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');

  if (!email) {
    showAuthError('이메일을 입력해주세요.');
    return;
  }
  if (password.length < 6) {
    showAuthError('비밀번호는 6자 이상이어야 해요.');
    return;
  }
  if (authMode === 'signup') {
    const confirmPw = document.getElementById('authPasswordConfirm').value;
    if (password !== confirmPw) {
      showAuthError('비밀번호가 일치하지 않아요.');
      return;
    }
  }

  submitBtn.disabled = true;
  try {
    if (authMode === 'signup') {
      const { data, error } = await auth.signUp({ email, password });
      if (error) {
        showAuthError(translateAuthError(error));
        return;
      }
      if (data.session) {
        closeAuthModal();          // 이메일 확인 OFF → 즉시 로그인
      } else {
        alert('가입 확인 메일을 보냈어요.\n메일함의 링크를 눌러 인증을 완료한 뒤 로그인해주세요.');
        setAuthMode('login');
      }
    } else {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) {
        showAuthError(translateAuthError(error));
        return;
      }
      closeAuthModal();
      // 로그인 성공 시 onAuthStateChange가 데이터 로드 + UI 갱신을 처리함
    }
  } finally {
    submitBtn.disabled = false;
  }
}

/* --- 로그아웃 --- */
async function handleLogout() {
  await auth.signOut();
  // onAuthStateChange가 비로그인 상태로 UI/데이터를 갱신함
}

/* --- 인증 관련 이벤트 바인딩 --- */
document.getElementById('authTriggerBtn').addEventListener('click', openAuthModal);
document.getElementById('authCancelBtn').addEventListener('click', closeAuthModal);
document.getElementById('authSubmitBtn').addEventListener('click', submitAuth);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);

document.getElementById('loginTab').addEventListener('click', () => setAuthMode('login'));
document.getElementById('signupTab').addEventListener('click', () => setAuthMode('signup'));

document.getElementById('authModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'authModalBackdrop') closeAuthModal();
});

['authEmail', 'authPassword', 'authPasswordConfirm'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitAuth();
    }
  });
});


/* ============================================================
   15. 데이터 백업/복원 (JSON 내보내기/가져오기)
   - 내보내기: 현재 화면의 library를 JSON 파일로 다운로드
   - 가져오기: JSON 파일 → 미리보기 → 클라우드 DB로 병합/덮어쓰기
   ============================================================ */

const BACKUP_THRESHOLD = 10;       // 영상 N개 이상이면 백업 권장 점 표시
let pendingImport = null;          // 가져오기 대기 중인 영상 배열
let pendingImportMeta = null;      // 미리보기에 표시할 파일 메타 정보

function updateBackupDot() {
  const dot = document.getElementById('backupDot');
  if (!dot) return;
  dot.classList.toggle('show', library.length >= BACKUP_THRESHOLD);
}

/**
 * 내보내기: 현재 library를 JSON 파일로 다운로드
 */
function exportToJson() {
  const now = new Date();
  const data = {
    exportedAt: now.toISOString(),
    version: '1.0',
    videoCount: library.length,
    videos: library
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube-library-backup-${formatDate(now)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 가져오기: 선택한 파일을 읽고 검증한 후 미리보기 모달 띄움
 */
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.videos)) {
        alert('영상 데이터가 없어요. (videos 배열이 없거나 잘못된 형식이에요.)');
        return;
      }
      if (data.videos.length === 0) {
        alert('영상 데이터가 없어요. (파일은 비어있어요.)');
        return;
      }
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

function openImportPreview() {
  const modal = document.getElementById('importModalBackdrop');
  const summary = document.getElementById('importSummary');

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
    <p>현재 책장에는 <strong>${library.length}개</strong>가 있어요. 어떻게 처리할까요?</p>
    ${metaLine}
  `;

  modal.classList.add('active');
}

function closeImportModal() {
  document.getElementById('importModalBackdrop').classList.remove('active');
  pendingImport = null;
  pendingImportMeta = null;
  document.getElementById('importFileInput').value = '';
}

/**
 * 병합: videoId 기준 중복 제거 후, 새 영상만 클라우드 DB로 insert
 */
async function importMerge() {
  if (!pendingImport) return;
  if (!currentUser) {
    alert('가져오려면 로그인이 필요해요.');
    return;
  }

  // 현재 책장에 없는 영상만 추림
  const existingIds = new Set(library.map(v => v.videoId));
  const newOnes = pendingImport.filter(v => v.videoId && !existingIds.has(v.videoId));

  if (newOnes.length === 0) {
    closeImportModal();
    alert('추가할 새 영상이 없어요. (모두 이미 책장에 있어요.)');
    return;
  }

  const rows = newOnes.map(v => ({
    user_id: currentUser.id,
    video_id: v.videoId,
    title: v.title,
    channel: v.channel || null,
    category: v.category || null,
    note: v.note || null
  }));

  try {
    const { error } = await window.supabaseClient.from('videos').insert(rows);
    if (error) throw error;
  } catch (e) {
    handleSupabaseError(e, '가져오기에 실패했어요');
    return;
  }

  await finalizeImport(`${newOnes.length}개의 새 영상을 가져왔어요. (중복 ${pendingImport.length - newOnes.length}개는 건너뛰었어요.)`);
}

/**
 * 덮어쓰기: confirm 후, 현재 사용자의 영상을 모두 삭제하고 새로 insert
 */
async function importReplace() {
  if (!pendingImport) return;
  if (!currentUser) {
    alert('가져오려면 로그인이 필요해요.');
    return;
  }

  const ok = confirm(
    `현재 책장의 영상 ${library.length}개를 모두 삭제하고 새 ${pendingImport.length}개로 교체합니다.\n\n계속하시겠어요?`
  );
  if (!ok) return;

  const rows = pendingImport.map(v => ({
    user_id: currentUser.id,
    video_id: v.videoId,
    title: v.title,
    channel: v.channel || null,
    category: v.category || null,
    note: v.note || null
  }));

  try {
    // 현재 사용자의 모든 영상 삭제
    const { error: delError } = await window.supabaseClient
      .from('videos').delete().eq('user_id', currentUser.id);
    if (delError) throw delError;
    // 새 영상 insert
    const { error: insError } = await window.supabaseClient
      .from('videos').insert(rows);
    if (insError) throw insError;
  } catch (e) {
    handleSupabaseError(e, '가져오기에 실패했어요');
    return;
  }

  await finalizeImport(`${pendingImport.length}개 영상으로 교체했어요.`);
}

/**
 * 가져오기 마무리: 모달 닫기 + 데이터 다시 로드 + 알림
 */
async function finalizeImport(message) {
  closeImportModal();
  await refreshLibrary();
  alert(message);
}

// 내보내기 버튼
document.getElementById('exportBtn').addEventListener('click', exportToJson);

// 가져오기 버튼 → 숨김 file input 트리거
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
});

document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
document.getElementById('importMergeBtn').addEventListener('click', importMerge);
document.getElementById('importReplaceBtn').addEventListener('click', importReplace);

document.getElementById('importModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'importModalBackdrop') closeImportModal();
});


/* ============================================================
   16. 초기 화면
   - 데이터 로드와 렌더링은 14번의 onAuthStateChange → refreshLibrary가
     페이지 로드 직후 자동으로 처리함
   - 여기서는 그 전까지 보일 로딩 표시만 띄워둠
   ============================================================ */
showLoading();
