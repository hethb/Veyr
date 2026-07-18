import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { GraphCanvas, GraphLegend } from "../components/GraphCanvas";
import { onGraphData, post, type EmbedGraphPayload } from "./bridge";
import "../index.css";

const HEADER_HEIGHT = 44;

function App() {
  const [data, setData] = useState<EmbedGraphPayload | null>(null);
  const [height, setHeight] = useState(() => window.innerHeight - HEADER_HEIGHT);

  useEffect(() => onGraphData(setData), []);

  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight - HEADER_HEIGHT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0b10] text-sm text-neutral-500">
        Waiting for the codebase graph…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col gap-2 bg-[#0a0b10] p-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <GraphLegend />
        {data.workspaceRoot && <span className="truncate pl-3">{data.workspaceRoot}</span>}
      </div>
      <div className="min-h-0 flex-1">
        <GraphCanvas
          nodes={data.nodes}
          links={data.links}
          height={height}
          onFocusNode={(node) => post({ type: "focusNode", file: node.file, line: node.line ?? null })}
        />
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

ReactDOM.createRoot(rootEl).render(<App />);
