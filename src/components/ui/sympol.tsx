import React from "react";

export function LogoConceptA(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-12 h-12" {...props}>
      <defs>
        <linearGradient id="gradBold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.65 0.20 320)" />
          <stop offset="100%" stopColor="oklch(0.55 0.20 280)" />
        </linearGradient>
      </defs>

      {/* 과감한 솔리드 문서 배경 (우상단 접힘) */}
      <path d="M 30 50 Q 30 30 50 30 L 100 30 L 140 70 L 140 150 Q 140 170 120 170 L 50 170 Q 30 170 30 150 Z" 
            fill="oklch(0.97 0.01 250)" stroke="oklch(0.90 0.03 250)" strokeWidth="8" 
            className="dark:fill-slate-800 dark:stroke-slate-700" />
            
      {/* 접힌 모서리 디테일 */}
      <path d="M 100 30 L 100 60 Q 100 70 110 70 L 140 70" 
            fill="none" stroke="oklch(0.90 0.03 250)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" 
            className="dark:stroke-slate-700" />

      {/* 내부 텍스트 라인이자 깃 브랜치의 시작 (메인 축) */}
      <path d="M 60 130 L 170 130" fill="none" stroke="oklch(0.60 0.15 250)" strokeWidth="20" strokeLinecap="round" />

      {/* 문서 밖으로 뻗어나가는 굵고 역동적인 머지 브랜치 */}
      <path d="M 60 80 L 100 80 C 130 80, 130 130, 170 130" fill="none" stroke="url(#gradBold)" strokeWidth="20" strokeLinecap="round" />

      {/* 시선을 끄는 오버사이즈 노드 포인트 */}
      <circle cx="60" cy="80" r="14" fill="oklch(0.65 0.20 320)" />
      <circle cx="60" cy="130" r="14" fill="oklch(0.60 0.15 250)" />
      
      {/* 데이터가 결합되어 탄생한 외부의 거대한 인사이트 노드 */}
      <circle cx="170" cy="130" r="22" fill="oklch(0.55 0.20 280)" stroke="white" strokeWidth="6" className="dark:stroke-slate-900" />
      <circle cx="170" cy="130" r="6" fill="white" className="dark:fill-slate-900" />
    </svg>
  );
}

export function LogoConceptB(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-12 h-12" {...props}>
      <defs>
        <linearGradient id="gradB" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.65 0.14 140)" />
          <stop offset="100%" stopColor="oklch(0.60 0.15 250)" />
        </linearGradient>
      </defs>
      
      {/* 좌측 깃 브랜치 축 (Spine) */}
      <line x1="50" y1="30" x2="50" y2="170" stroke="url(#gradB)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 50 100 C 70 100, 80 75, 90 75" fill="none" stroke="oklch(0.65 0.16 320)" strokeWidth="10" strokeLinecap="round" />

      {/* 연결된 문서/보고서 블록 (상단) */}
      <rect x="85" y="45" width="85" height="50" rx="10" fill="oklch(0.95 0.03 200)" stroke="oklch(0.65 0.16 320)" strokeWidth="8" className="dark:fill-slate-800" />
      <line x1="105" y1="60" x2="145" y2="60" stroke="oklch(0.65 0.16 320)" strokeWidth="6" strokeLinecap="round"/>
      <line x1="105" y1="75" x2="130" y2="75" stroke="oklch(0.65 0.16 320)" strokeWidth="6" strokeLinecap="round"/>

      {/* 연결된 문서/보고서 블록 (하단) */}
      <rect x="70" y="115" width="100" height="50" rx="10" fill="oklch(0.95 0.03 250)" stroke="oklch(0.60 0.15 250)" strokeWidth="8" className="dark:fill-slate-800" />
      <line x1="90" y1="130" x2="150" y2="130" stroke="oklch(0.60 0.15 250)" strokeWidth="6" strokeLinecap="round"/>
      <line x1="90" y1="145" x2="120" y2="145" stroke="oklch(0.60 0.15 250)" strokeWidth="6" strokeLinecap="round"/>

      {/* 커밋 노드 포인트 */}
      <circle cx="50" cy="70" r="16" fill="oklch(0.65 0.14 140)" stroke="white" strokeWidth="6" className="dark:stroke-slate-900" />
      <circle cx="50" cy="140" r="16" fill="oklch(0.60 0.15 250)" stroke="white" strokeWidth="6" className="dark:stroke-slate-900" />
      <circle cx="90" cy="75" r="10" fill="oklch(0.65 0.16 320)" />
    </svg>
  );
}

export function LogoConceptC(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="w-12 h-12" {...props}>
      {/* 기본 문서(서류) 베이스 형태 */}
      <path d="M 50 30 L 110 30 L 150 70 L 150 170 A 10 10 0 0 1 140 180 L 60 180 A 10 10 0 0 1 50 170 Z" fill="none" stroke="oklch(0.75 0.05 250)" strokeWidth="12" strokeLinejoin="round" className="dark:stroke-slate-600" />
      <path d="M 110 30 L 110 70 L 150 70" fill="none" stroke="oklch(0.75 0.05 250)" strokeWidth="12" strokeLinejoin="round" className="dark:stroke-slate-600" />

      {/* 내부 병합(Merge) 노드 그래프 */}
      <path d="M 100 150 L 100 100 L 70 70" fill="none" stroke="oklch(0.65 0.18 35)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 100 115 L 130 85" fill="none" stroke="oklch(0.60 0.15 290)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>

      {/* 강조된 커밋 노드 */}
      <circle cx="70" cy="70" r="14" fill="oklch(0.65 0.18 35)" stroke="white" strokeWidth="4" className="dark:stroke-slate-900" />
      <circle cx="130" cy="85" r="14" fill="oklch(0.60 0.15 290)" stroke="white" strokeWidth="4" className="dark:stroke-slate-900" />
      <circle cx="100" cy="150" r="14" fill="oklch(0.60 0.15 250)" stroke="white" strokeWidth="4" className="dark:stroke-slate-900" />
    </svg>
  );
}
