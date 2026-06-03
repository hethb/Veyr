interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "h-6 w-full" }: SkeletonProps) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className}`} />;
}
