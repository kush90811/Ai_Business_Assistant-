import React from "react";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8 space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-card/85 backdrop-blur-xl rounded-xl border border-violet-500/20" />
          <div className="h-4 w-96 bg-card/60 rounded-lg" />
        </div>
        <div className="h-9 w-44 bg-card/85 rounded-xl border border-violet-500/20" />
      </div>

      {/* Grid Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-card/85 border border-violet-500/20 p-5 flex flex-col justify-between"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 bg-card/60 rounded" />
              <div className="h-8 w-8 rounded-xl bg-violet-500/10 border border-violet-500/20" />
            </div>
            <div className="h-8 w-16 bg-card/80 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[500px] rounded-2xl bg-card/85 border border-violet-500/20 p-4 space-y-4"
          >
            <div className="h-10 rounded-xl bg-violet-500/10 border border-violet-500/20" />
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-32 rounded-xl bg-card/60 border border-white/5" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
