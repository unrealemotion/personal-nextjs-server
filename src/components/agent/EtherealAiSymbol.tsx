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
                <linearGradient id="etherealGradientBrilliant" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" /> 
                    <stop offset="25%" stopColor="#e879f9" /> {/* Fuchsia 400 */}
                    <stop offset="50%" stopColor="#22d3ee" /> {/* Cyan 400 */}
                    <stop offset="100%" stopColor="#818cf8" /> {/* Indigo 400 */}
                </linearGradient>
                <linearGradient id="etherealGradientCore" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="50%" stopColor="#a78bfa" /> {/* Purple 400 */}
                    <stop offset="100%" stopColor="#38bdf8" /> {/* Sky 400 */}
                </linearGradient>
                <filter id="etherealGlowBright" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur1" />
                    <feGaussianBlur stdDeviation="12" result="blur2" />
                    <feGaussianBlur stdDeviation="24" result="blur3" />
                    <feMerge>
                        <feMergeNode in="blur3" />
                        <feMergeNode in="blur2" />
                        <feMergeNode in="blur1" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="coreGlowBright" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.5" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <style>
                {`
                    @keyframes ethereal-spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    @keyframes ethereal-spin-reverse {
                        from { transform: rotate(360deg); }
                        to { transform: rotate(0deg); }
                    }
                    @keyframes ethereal-pulse-bright {
                        0%, 100% { opacity: 0.3; transform: scale(0.95); }
                        50% { opacity: 0.6; transform: scale(1.05); }
                    }
                    .ethereal-spin-element {
                        transform-origin: 50px 50px;
                        animation: ethereal-spin 15s linear infinite;
                    }
                    .ethereal-spin-reverse-element {
                        transform-origin: 50px 50px;
                        animation: ethereal-spin-reverse 12s linear infinite;
                    }
                    .ethereal-pulse-element {
                        transform-origin: 50px 50px;
                        animation: ethereal-pulse-bright 3s ease-in-out infinite;
                    }
                `}
            </style>

            {/* Glowing background aura */}
            <circle 
                cx="50" cy="50" r="26" 
                fill="url(#etherealGradientBrilliant)" 
                filter="url(#etherealGlowBright)" 
                className="ethereal-pulse-element" 
            />

            {/* The main sharp spark / 4-pointed star */}
            <path
                d="M 50 0 Q 50 50 100 50 Q 50 50 50 100 Q 50 50 0 50 Q 50 50 50 0 Z"
                fill="url(#etherealGradientBrilliant)"
                opacity="0.9"
                filter="url(#coreGlowBright)"
                className="ethereal-spin-element"
            />

            {/* The secondary sharp spark / 4-pointed star (makes it 8-pointed) */}
            <path
                d="M 50 15 Q 50 50 85 50 Q 50 50 50 85 Q 50 50 15 50 Q 50 50 50 15 Z"
                fill="url(#etherealGradientCore)"
                opacity="0.95"
                filter="url(#coreGlowBright)"
                className="ethereal-spin-reverse-element"
            />

            {/* Central intensely bright core */}
            <circle cx="50" cy="50" r="5" fill="#ffffff" filter="url(#coreGlowBright)" />
            <circle cx="50" cy="50" r="2" fill="#ffffff" />
        </svg>
    );
}
