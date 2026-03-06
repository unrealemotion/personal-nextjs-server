import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Github } from "lucide-react";

export function Footer() {
    return (
        <footer className="border-t border-white/5 bg-[#050505] py-12 relative z-10 w-full mt-auto">
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-white/40 text-sm">
                <div className="flex items-center space-x-2 mb-4 md:mb-0 hidden md:flex">
                    <div className="w-6 h-6 relative rounded-md overflow-hidden grayscale opacity-50">
                        <Image src="/logo.png" alt="Logo" fill className="object-contain p-0.5" />
                    </div>
                    <span className="font-semibold text-white/60">UnrealEmo</span>
                </div>

                <div className="flex items-center space-x-6 text-sm font-medium text-white/60 mb-4 md:mb-0">
                    <Link href="https://github.com/unrealemotion" target="_blank" className="hover:text-white transition-colors flex items-center space-x-2">
                        <Github className="w-4 h-4" />
                        <span className="hidden sm:inline">GitHub</span>
                    </Link>
                </div>

                <p>© {new Date().getFullYear()} UnrealEmo's Tools</p>
            </div>
        </footer>
    );
}
