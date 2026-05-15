/* ============================================================
   나의 유튜브 서재 v2 - 스크립트
   - 영상 데이터를 브라우저 localStorage에 저장
   - 카테고리 필터링, 추가/편집/삭제, 클릭 시 재생 처리
   - (v2: 카드 마크업을 새 디자인 시스템에 맞춰 업데이트)
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
   2. 유튜브 URL → videoId 추출
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
   3. 렌더링 - 헤더 메타 줄 ("Vol. 03 · N Films · Spring, 2026")
   - 영상 개수만 동적으로, 나머지는 정적 라벨
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
   4. 렌더링 - 카테고리 탭
   ============================================================ */
function renderCategories() {
  const nav = document.getElementById('categories');

  // '전체' + 영상에 등록된 모든 카테고리 (중복 제거)
  const categories = ['전체', ...new Set(library.map(v => v.category).filter(Boolean))];

  nav.innerHTML = categories.map(cat => {
    const count = cat === '전체'
      ? library.length
      : library.filter(v => v.category === cat).length;
    const active = cat === currentCategory ? 'active' : '';
    const ariaSelected = cat === currentCategory ? 'true' : 'false';
    return `<button class="cat-btn ${active}" role="tab" aria-selected="${ariaSelected}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}<span class="count">(${count})</span></button>`;
  }).join('');

  // 카테고리 버튼 클릭 → 필터 변경
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
   5. 렌더링 - 영상 카드 그리드
   ============================================================ */

// 재생 버튼 안에 들어갈 SVG 아이콘 (▶)
const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function renderVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');

  // 현재 카테고리에 해당하는 영상만 필터
  const filtered = currentCategory === '전체'
    ? library
    : library.filter(v => v.category === currentCategory);

  // 결과가 없으면 빈 상태 메시지 표시
  if (filtered.length === 0) {
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
  // .playing 클래스도 추가해서 그라디언트/재생버튼을 깔끔히 숨김
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
   6. HTML 이스케이프 (XSS 방지)
   ============================================================ */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}


/* ============================================================
   7. 모달 - 열기 / 닫기
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
   8. 영상 저장 (추가 또는 편집)
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
   9. 영상 삭제 (페이드 아웃 → 실제 제거)
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
   10. 이벤트 바인딩 (모달, 키보드 등)
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

// ESC 키 → 모달 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});


/* ============================================================
   11. URL 입력칸에서 포커스를 빼면 → oEmbed로 제목/채널 자동 채우기
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
   12. 초기 렌더
   ============================================================ */
saveLibrary();        // 첫 방문 시 샘플 데이터를 localStorage에도 기록
renderMeta();
renderCategories();
renderVideos();
