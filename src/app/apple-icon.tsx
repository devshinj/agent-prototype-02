import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gradBold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c45ea0" />
              <stop offset="100%" stopColor="#7b4fbf" />
            </linearGradient>
          </defs>

          {/* 문서 배경 (우상단 접힘) */}
          <path
            d="M 30 50 Q 30 30 50 30 L 100 30 L 140 70 L 140 150 Q 140 170 120 170 L 50 170 Q 30 170 30 150 Z"
            fill="#f0f0f8"
            stroke="#d4d4e8"
            strokeWidth="8"
          />

          {/* 접힌 모서리 디테일 */}
          <path
            d="M 100 30 L 100 60 Q 100 70 110 70 L 140 70"
            fill="none"
            stroke="#d4d4e8"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 메인 브랜치 라인 */}
          <path
            d="M 60 130 L 170 130"
            fill="none"
            stroke="#5b6abf"
            strokeWidth="20"
            strokeLinecap="round"
          />

          {/* 머지 브랜치 */}
          <path
            d="M 60 80 L 100 80 C 130 80, 130 130, 170 130"
            fill="none"
            stroke="url(#gradBold)"
            strokeWidth="20"
            strokeLinecap="round"
          />

          {/* 분기 시작 노드 */}
          <circle cx="60" cy="80" r="14" fill="#c45ea0" />
          {/* 메인 시작 노드 */}
          <circle cx="60" cy="130" r="14" fill="#5b6abf" />

          {/* 머지 목적지 노드 */}
          <circle cx="170" cy="130" r="22" fill="#7b4fbf" stroke="white" strokeWidth="6" />
          <circle cx="170" cy="130" r="6" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
