/* ============================================================
   Supabase 클라이언트 초기화
   - 이 사이트와 Supabase 백엔드를 잇는 연결 진입점
   - script.js보다 먼저 로드되어 window.supabaseClient를 준비함

   [보안 모델]
   anon key는 공개 가능한 키입니다.
   실제 보안은 Supabase RLS 정책으로 강제됩니다.
   자세한 보안 모델은 README.md 참조.
   ============================================================ */

/* Supabase 프로젝트 연결 정보
   - SUPABASE_URL: 프로젝트 기본 주소 ('/rest/v1/' 같은 경로는 붙이지 않음)
   - SUPABASE_ANON_KEY: 공개용 anon 키
     → 코드에 그대로 노출돼도 안전하게 설계된 키.
       실제 데이터 보호는 데이터베이스의 RLS(Row Level Security) 정책이 담당.
       (service_role 키는 절대 여기에 넣지 말 것!) */
const SUPABASE_URL = 'https://ltgdjhwsdzyzhgekdxgt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2RqaHdzZHp5emhnZWtkeGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTU5MTEsImV4cCI6MjA5NDQzMTkxMX0.hlUGbrh0Rv7RXCGkMK-p0dqnVPmQ6Nt4Sj_XjAublPQ';

// CDN으로 로드한 supabase-js 라이브러리는 window.supabase 전역 객체를 만듦.
// 거기서 createClient 함수를 꺼냄.
const { createClient } = window.supabase;

// Supabase 클라이언트 생성 → 다른 파일에서 window.supabaseClient로 접근 가능
window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase connected');
