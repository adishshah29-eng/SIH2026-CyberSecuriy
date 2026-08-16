"use client";

import dynamic from "next/dynamic";

export const OriginMap = dynamic(
  () => import("./origin-map").then((mod) => mod.OriginMap),
  { ssr: false, loading: () => <div className="h-48 w-full animate-pulse rounded-lg bg-neutral-100" /> },
);
