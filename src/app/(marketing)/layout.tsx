"use client";

import dynamic from "next/dynamic";
import { SHADER_PRESETS, DEFAULT_SHADER } from "@/core/constants/shader-presets";

const ShaderGradientCanvas = dynamic(() => import("@shadergradient/react").then(m => ({ default: m.ShaderGradientCanvas })), { ssr: false });
const ShaderGradient = dynamic(() => import("@shadergradient/react").then(m => ({ default: m.ShaderGradient })), { ssr: false });

const preset = SHADER_PRESETS.find(p => p.name === DEFAULT_SHADER) ?? SHADER_PRESETS[0];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen text-foreground relative" style={{ backgroundColor: "#000000" }}>
      {/* Shared shader gradient — persists across page navigations */}
      <ShaderGradientCanvas
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0, animation: "fade-in 1s ease-in 0.5s forwards" }}
        pixelDensity={2}
        fov={preset.fov}
      >
        <ShaderGradient {...preset.props} />
      </ShaderGradientCanvas>

      {children}
    </div>
  );
}
