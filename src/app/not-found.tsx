"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Floating particle component
function Particle({ delay, duration, size, x, y, opacity }: {
    delay: number;
    duration: number;
    size: number;
    x: number;
    y: number;
    opacity: number;
}) {
    return (
        <div
            className="absolute rounded-full pointer-events-none"
            style={{
                width: size,
                height: size,
                left: `${x}%`,
                top: `${y}%`,
                opacity: 0,
                background: `radial-gradient(circle, rgba(139, 92, 246, ${opacity}) 0%, transparent 70%)`,
                animation: `floatParticle ${duration}s ${delay}s ease-in-out infinite`,
            }}
        />
    );
}

// Ethereal orb component
function GlowOrb({ x, y, size, color, delay }: {
    x: number;
    y: number;
    size: number;
    color: string;
    delay: number;
}) {
    return (
        <div
            className="absolute rounded-full pointer-events-none"
            style={{
                width: size,
                height: size,
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                filter: `blur(${size / 3}px)`,
                animation: `orbPulse ${8 + delay * 2}s ${delay}s ease-in-out infinite, orbDrift ${12 + delay * 3}s ${delay}s ease-in-out infinite`,
            }}
        />
    );
}

export default function NotFound() {
    const router = useRouter();
    const [countdown, setCountdown] = useState(10);
    const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
    const [isVisible, setIsVisible] = useState(false);
    const [glitchActive, setGlitchActive] = useState(false);

    // Entrance animation
    useEffect(() => {
        const t = setTimeout(() => setIsVisible(true), 100);
        return () => clearTimeout(t);
    }, []);

    // Countdown and redirect
    useEffect(() => {
        if (countdown <= 0) {
            router.push("/");
            return;
        }
        const timer = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [countdown, router]);

    // Random glitch effect
    useEffect(() => {
        const interval = setInterval(() => {
            setGlitchActive(true);
            setTimeout(() => setGlitchActive(false), 150);
        }, 3000 + Math.random() * 4000);
        return () => clearInterval(interval);
    }, []);

    // Mouse tracking for parallax
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        });
    }, []);

    // Generate particles
    const particles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        delay: Math.random() * 5,
        duration: 4 + Math.random() * 6,
        size: 2 + Math.random() * 4,
        x: Math.random() * 100,
        y: Math.random() * 100,
        opacity: 0.3 + Math.random() * 0.5,
    }));

    const parallaxX = (mousePos.x - 50) * 0.02;
    const parallaxY = (mousePos.y - 50) * 0.02;

    return (
        <div
            className="notfound-overlay flex items-center justify-center overflow-hidden cursor-crosshair select-none"
            onMouseMove={handleMouseMove}
            style={{
                background: "radial-gradient(ellipse at 50% 50%, #0a0a12 0%, #050508 40%, #000000 100%)",
            }}
        >
            {/* Scan line effect */}
            <div
                className="absolute inset-0 pointer-events-none overflow-hidden"
                style={{ opacity: 0.03 }}
            >
                <div
                    className="absolute w-full h-[2px] bg-violet-400/80"
                    style={{ animation: "scanLine 4s linear infinite" }}
                />
            </div>

            {/* Noise texture overlay */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    opacity: 0.04,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Ethereal glow orbs - parallax layer */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    transform: `translate(${parallaxX}%, ${parallaxY}%)`,
                    transition: "transform 0.3s ease-out",
                }}
            >
                <GlowOrb x={20} y={30} size={300} color="rgba(139, 92, 246, 0.08)" delay={0} />
                <GlowOrb x={75} y={60} size={250} color="rgba(79, 70, 229, 0.06)" delay={1.5} />
                <GlowOrb x={50} y={20} size={200} color="rgba(168, 85, 247, 0.05)" delay={3} />
                <GlowOrb x={30} y={75} size={180} color="rgba(99, 102, 241, 0.04)" delay={2} />
                <GlowOrb x={85} y={25} size={160} color="rgba(139, 92, 246, 0.06)" delay={4} />
            </div>

            {/* Floating particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {particles.map((p) => (
                    <Particle key={p.id} {...p} />
                ))}
            </div>

            {/* Expanding void rings */}
            <div className="absolute left-1/2 top-1/2 pointer-events-none">
                {[0, 2, 4].map((delay) => (
                    <div
                        key={delay}
                        className="absolute rounded-full border border-violet-500/10"
                        style={{
                            width: 200,
                            height: 200,
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            animation: `ringExpand 6s ${delay}s ease-out infinite`,
                        }}
                    />
                ))}
            </div>

            {/* Main content */}
            <div
                className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg"
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(40px)",
                    transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            >
                {/* 404 Number - Ethereal */}
                <div className="relative mb-6">
                    <h1
                        className="text-[120px] sm:text-[160px] font-black leading-none tracking-tight"
                        style={{
                            background: "linear-gradient(180deg, rgba(139, 92, 246, 0.9) 0%, rgba(139, 92, 246, 0.15) 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            animation: glitchActive ? "glitch 0.15s ease-in-out" : "countdownPulse 3s ease-in-out infinite",
                            filter: glitchActive ? "hue-rotate(90deg)" : "none",
                            transition: "filter 0.1s",
                        }}
                    >
                        404
                    </h1>

                    {/* Ghost reflection */}
                    <div
                        className="absolute -bottom-4 left-0 right-0 h-16 pointer-events-none"
                        style={{
                            background: "linear-gradient(180deg, rgba(139, 92, 246, 0.06) 0%, transparent 100%)",
                            filter: "blur(8px)",
                            transform: "scaleY(-0.3)",
                            transformOrigin: "top",
                        }}
                    />
                </div>

                {/* Enigmatic message */}
                <p
                    className="text-[10px] sm:text-xs font-bold uppercase text-violet-300/60 mb-3"
                    style={{
                        animation: isVisible ? "textReveal 1.5s 0.3s ease-out both" : "none",
                    }}
                >
                    Lost in the void
                </p>

                <p
                    className="text-sm sm:text-base text-white/30 font-light leading-relaxed max-w-xs mb-10"
                    style={{
                        animation: isVisible ? "fadeSlideUp 1s 0.6s ease-out both" : "none",
                    }}
                >
                    The page you seek has dissolved into the ether.
                    <br />
                    <span className="text-white/15">Nothing remains here.</span>
                </p>

                {/* Countdown ring */}
                <div
                    className="relative mb-8"
                    style={{
                        animation: isVisible ? "fadeSlideUp 1s 0.9s ease-out both" : "none",
                    }}
                >
                    <div className="relative w-20 h-20 flex items-center justify-center">
                        {/* SVG ring timer */}
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                            {/* Background ring */}
                            <circle
                                cx="40"
                                cy="40"
                                r="36"
                                fill="none"
                                stroke="rgba(139, 92, 246, 0.08)"
                                strokeWidth="2"
                            />
                            {/* Progress ring */}
                            <circle
                                cx="40"
                                cy="40"
                                r="36"
                                fill="none"
                                stroke="rgba(139, 92, 246, 0.5)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 36}`}
                                strokeDashoffset={`${2 * Math.PI * 36 * (1 - countdown / 10)}`}
                                style={{
                                    transition: "stroke-dashoffset 1s linear",
                                    filter: "drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))",
                                }}
                            />
                        </svg>

                        {/* Countdown number */}
                        <span
                            className="text-2xl font-mono font-bold text-violet-300/80 tabular-nums"
                            style={{
                                animation: "countdownPulse 2s ease-in-out infinite",
                            }}
                            key={countdown}
                        >
                            {countdown}
                        </span>
                    </div>
                </div>

                {/* Shimmer text */}
                <p
                    className="text-[10px] text-white/20 font-medium tracking-widest uppercase mb-6"
                    style={{
                        background: "linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.1) 100%)",
                        backgroundSize: "200% 100%",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        animation: "shimmer 3s linear infinite",
                    }}
                >
                    Returning to reality in {countdown}s
                </p>

                {/* Return button */}
                <Link
                    href="/"
                    className="group relative"
                    style={{
                        animation: isVisible ? "fadeSlideUp 1s 1.2s ease-out both" : "none",
                    }}
                >
                    <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-violet-600/20 via-indigo-600/20 to-violet-600/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative px-6 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] backdrop-blur-sm text-xs font-semibold text-violet-300/70 hover:text-violet-200 hover:border-violet-400/40 hover:bg-violet-500/10 transition-all duration-300 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Return Home
                    </div>
                </Link>
            </div>

            {/* Bottom gradient vignette */}
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />
        </div>
    );
}
