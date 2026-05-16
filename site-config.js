/* ============================================================
   사이트 설정
   - OWNER_USER_ID: 이 사이트(책장)의 "주인"인 Supabase user_id
   - "개인 블로그" 모델의 기준점:
     · 비로그인 방문자 → 주인의 책장을 둘러보기
     · 주인 본인 로그인 → 자기 책장 편집
     · 다른 사용자 로그인 → 자기만의 책장
   ============================================================ */

/* 사이트 소유자의 Supabase user_id (UUID 형태)

   ▼ 채우는 방법
   1) 본인 이메일로 회원가입 + 로그인
   2) Supabase 대시보드 → Authentication → Users
      → 본인 계정의 'User UID'를 복사
   3) 아래 따옴표 안에 붙여넣기

   ※ 비어 있으면 모든 로그인 사용자가 'guest-user'로 인식됨 (주인 미지정 상태) */
const OWNER_USER_ID = "00aceb71-7bbb-4f52-94a2-f930e4fc6b45";

// 다른 스크립트(script.js)에서 window.OWNER_USER_ID로 접근
window.OWNER_USER_ID = OWNER_USER_ID;
