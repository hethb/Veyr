import { motion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface NavItem {
  name: string;
  url: string;
  icon: LucideIcon;
}

interface NavBarProps {
  items: NavItem[];
  className?: string;
}

function NavLink({
  item,
  isActive,
  onActivate,
}: {
  item: NavItem;
  isActive: boolean;
  onActivate: () => void;
}) {
  const Icon = item.icon;
  const className = cn(
    "relative cursor-pointer text-sm font-semibold px-6 py-2 rounded-full transition-colors",
    "text-foreground/80 hover:text-primary",
    isActive && "bg-muted text-primary"
  );

  const content = (
    <>
      <span className="hidden md:inline">{item.name}</span>
      <span className="md:hidden">
        <Icon size={18} strokeWidth={2.5} />
      </span>
      {isActive && (
        <motion.div
          layoutId="lamp"
          className="absolute inset-0 w-full bg-primary/5 rounded-full -z-10"
          initial={false}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-t-full">
            <div className="absolute w-12 h-6 bg-primary/20 rounded-full blur-md -top-2 -left-2" />
            <div className="absolute w-8 h-6 bg-primary/20 rounded-full blur-md -top-1" />
            <div className="absolute w-4 h-4 bg-primary/20 rounded-full blur-sm top-0 left-2" />
          </div>
        </motion.div>
      )}
    </>
  );

  if (item.url.startsWith("#")) {
    return (
      <a href={item.url} onClick={onActivate} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link to={item.url} onClick={onActivate} className={className}>
      {content}
    </Link>
  );
}

export function NavBar({ items, className }: NavBarProps) {
  const [activeTab, setActiveTab] = useState(items[0]?.name ?? "");

  useEffect(() => {
    const hashItems = items.filter((item) => item.url.startsWith("#"));
    if (hashItems.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length === 0) return;

        const id = `#${visible[0].target.id}`;
        const match = items.find((item) => item.url === id);
        if (match) setActiveTab(match.name);
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0, 0.15, 0.35] }
    );

    for (const item of hashItems) {
      const el = document.querySelector(item.url);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  return (
    <div
      className={cn(
        // bottom-0 must be unset at sm: (sm:bottom-auto) — otherwise the fixed
        // container spans top-0..bottom-0, a full-height invisible z-50 strip
        // that blocks every centered click on the page. pointer-events-none
        // keeps the wrapper inert either way; only the pill itself is hot.
        "pointer-events-none fixed bottom-0 sm:bottom-auto sm:top-0 left-1/2 -translate-x-1/2 z-50 mb-6 sm:pt-6",
        className
      )}
    >
      <div className="pointer-events-auto flex items-center gap-3 bg-background/5 border border-border backdrop-blur-lg py-1 px-1 rounded-full shadow-lg">
        {items.map((item) => (
          <NavLink
            key={item.name}
            item={item}
            isActive={activeTab === item.name}
            onActivate={() => setActiveTab(item.name)}
          />
        ))}
      </div>
    </div>
  );
}
