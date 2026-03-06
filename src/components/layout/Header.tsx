import React from "react";
import Link from "next/link";
import Image from "next/image";


export function Header() {
    return (
        <nav className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50 bg-[#050505]/70">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-3 group cursor-pointer">
                    <div className="relative w-10 h-10 overflow-hidden rounded-xl transition-colors shadow-lg shadow-indigo-500/10 group-hover:shadow-indigo-500/20">
                        <Image src="/logo.png" alt="UnrealEmo Logo" fill className="object-contain p-1" />
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        UnrealEmo
                    </span>
                </Link>
            </div>
        </nav>
    );
}
