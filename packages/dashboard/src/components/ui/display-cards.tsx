import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

export interface DisplayCardProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  date?: string;
  titleClassName?: string;
}

interface DisplayCardItemProps extends DisplayCardProps {
  index: number;
  popped: boolean;
}

const STACK_BASE =
  "[grid-area:stack] before:absolute before:left-0 before:top-0 before:h-full before:w-full before:rounded-xl before:bg-background/50 before:bg-blend-overlay before:outline before:outline-1 before:outline-border before:transition-opacity before:duration-700 before:content-['']";

const CARD_LAYOUTS = [
  {
    rest: "",
    popped: "-translate-y-10",
    grayscale: true,
    zIndex: "z-[30]",
  },
  {
    rest: "translate-x-12 translate-y-10 sm:translate-x-16",
    popped: "translate-x-12 -translate-y-1 sm:translate-x-16",
    grayscale: true,
    zIndex: "z-[20]",
  },
  {
    rest: "translate-x-24 translate-y-20 sm:translate-x-32",
    popped: "translate-x-24 translate-y-10 sm:translate-x-32",
    grayscale: false,
    zIndex: "z-[10]",
  },
] as const;

function DisplayCard({
  index,
  popped,
  icon = <Sparkles className="size-4 text-[#B1C5FF]" />,
  title = "Featured",
  description = "Discover amazing content",
  date = "Just now",
  titleClassName = "text-[#4FABFF]",
}: DisplayCardItemProps) {
  const layout = CARD_LAYOUTS[index] ?? CARD_LAYOUTS[0];

  return (
    <div
      className={cn(
        "relative flex h-36 w-[22rem] -skew-y-[8deg] select-none flex-col justify-between rounded-xl border-2 bg-muted/70 backdrop-blur-sm px-4 py-3 transition-all duration-700 after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[20rem] after:bg-gradient-to-l after:from-background after:to-transparent after:content-[''] [&>*]:flex [&>*]:items-center [&>*]:gap-2",
        STACK_BASE,
        popped ? layout.popped : layout.rest,
        layout.grayscale && !popped && "grayscale",
        popped && layout.grayscale && "grayscale-0 before:opacity-0",
        popped && "border-white/20 bg-muted",
        popped && layout.zIndex
      )}
    >
      <div>
        <span className="relative inline-block rounded-full bg-[#076EFF]/30 p-1">
          {icon}
        </span>
        <p className={cn("text-lg font-medium", titleClassName)}>{title}</p>
      </div>
      <p className="text-lg leading-snug text-foreground/90">{description}</p>
      <p className="text-muted-foreground">{date}</p>
    </div>
  );
}

interface DisplayCardsProps {
  cards?: DisplayCardProps[];
}

export function DisplayCards({ cards }: DisplayCardsProps) {
  const [popped, setPopped] = useState(false);

  const defaultCards: DisplayCardProps[] = [
    {
      title: "Featured",
      description: "Discover amazing content",
      date: "Just now",
      titleClassName: "text-[#076EFF]",
    },
    {
      title: "Popular",
      description: "Trending this week",
      date: "2 days ago",
      titleClassName: "text-[#4FABFF]",
    },
    {
      title: "New",
      description: "Latest updates and features",
      date: "Today",
      titleClassName: "text-[#B1C5FF]",
    },
  ];

  const displayCards = cards ?? defaultCards;

  function togglePopped() {
    setPopped((current) => !current);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={popped}
        aria-label={popped ? "Collapse feature cards" : "Expand feature cards"}
        onClick={togglePopped}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            togglePopped();
          }
        }}
        className="grid cursor-pointer place-items-center opacity-100 animate-fade-in [grid-template-areas:'stack'] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FABFF]/50"
      >
        {displayCards.map((cardProps, index) => (
          <DisplayCard key={index} index={index} popped={popped} {...cardProps} />
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        {popped ? "Click to stack cards" : "Click to reveal all features"}
      </p>
    </div>
  );
}

export default DisplayCards;
