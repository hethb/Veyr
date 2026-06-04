interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "h-6 w-full" }: SkeletonProps) {
  return <div className={`animate-pulse bg-white/10 ${className}`} />;
}
