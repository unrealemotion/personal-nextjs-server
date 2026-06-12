import React from "react";

interface EtherealAiSymbolProps {
    className?: string;
}

export function EtherealAiSymbol({ className = "w-6 h-6" }: EtherealAiSymbolProps) {
    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${className} overflow-visible`}
        >
            <defs>
                {/* Core radial gradient */}
                <radialGradient id="aiCoreGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="1" /> {/* Indigo-400 */}
                    <stop offset="40%" stopColor="#c084fc" stopOpacity="0.8" /> {/* Purple-400 */}
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" /> {/* Indigo-500 */}
                </radialGradient>
                
                {/* Ring linear gradients */}
                <linearGradient id="aiRingGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
                <linearGradient id="aiRingGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                
                {/* Glow filter */}
                <filter id="aiGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Glowing Aura */}
            <circle cx="50" cy="50" r="30" fill="url(#aiCoreGrad)" className="animate-pulse" style={{ animationDuration: '3s' }} />

            {/* Core Element */}
            <circle cx="50" cy="50" r="10" fill="#ffffff" filter="url(#aiGlow)" className="animate-pulse" style={{ animationDuration: '2s' }} />
            <circle cx="50" cy="50" r="6" fill="#818cf8" />

            {/* Outer Orbital Ring 1 (diagonally tilted, counter-clockwise) */}
            <ellipse
                cx="50"
                cy="50"
                rx="36"
                ry="12"
                stroke="url(#aiRingGrad1)"
                strokeWidth="1.5"
                strokeDasharray="120 40"
                fill="none"
                style={{
                    transform: 'rotate(-30deg)',
                    transformOrigin: '50px 50px',
                    animation: 'spin-counter 6s linear infinite'
                }}
            />

            {/* Outer Orbital Ring 2 (diagonally tilted, clockwise) */}
            <ellipse
                cx="50"
                cy="50"
                rx="36"
                ry="12"
                stroke="url(#aiRingGrad2)"
                strokeWidth="1.5"
                strokeDasharray="80 30"
                fill="none"
                style={{
                    transform: 'rotate(45deg)',
                    transformOrigin: '50px 50px',
                    animation: 'spin-clockwise 8s linear infinite'
                }}
            />

            {/* Orbital node / particle */}
            <circle
                cx="50"
                cy="50"
                r="3"
                fill="#38bdf8"
                filter="url(#aiGlow)"
                style={{
                    animation: 'orbit-particle 4s linear infinite',
                    transformOrigin: '50px 50px'
                }}
            />
        </svg>
    );
}
