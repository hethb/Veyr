import type { ConvertResult } from "./types.js";

/**
 * HTML → Markdown.
 *
 * A small purpose-built converter — no turndown/cheerio dependency. It walks
 * the source linearly, tracks block context (list/table/code), and emits
 * Markdown for the tags MarkItDown also targets: headings, paragraphs, lists,
 * links, emphasis, code, blockquotes, tables, images, line breaks.
 *
 * It's not a general HTML5 parser — pathological input (e.g. unclosed tags
 * inside scripts) may fall through as raw text. That mirrors MarkItDown's
 * own "structure-preserving but not high-fidelity" stance for LLM input.
 */

interface Tag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  closing: boolean;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const SKIP_BLOCKS = new Set(["script", "style", "noscript", "iframe", "svg"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ref: string) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const code = parseInt(ref.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    if (ref.startsWith("#")) {
      const code = parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ref.toLowerCase()] ?? m;
  });
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[key] = decodeEntities(value);
  }
  return attrs;
}

function tokenize(html: string): Array<{ type: "text" | "tag"; value: string; tag?: Tag }> {
  const tokens: Array<{ type: "text" | "tag"; value: string; tag?: Tag }> = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      // Comments.
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        i = end === -1 ? html.length : end + 3;
        continue;
      }
      // Doctype / CDATA.
      if (html.startsWith("<!", i)) {
        const end = html.indexOf(">", i + 2);
        i = end === -1 ? html.length : end + 1;
        continue;
      }
      const end = html.indexOf(">", i + 1);
      if (end === -1) {
        tokens.push({ type: "text", value: html.slice(i) });
        break;
      }
      const raw = html.slice(i + 1, end);
      const closing = raw.startsWith("/");
      const body = closing ? raw.slice(1) : raw;
      const selfClosing = body.endsWith("/");
      const spaceAt = body.search(/\s/);
      const name = (spaceAt === -1 ? body : body.slice(0, spaceAt))
        .replace(/\/$/, "")
        .toLowerCase();
      if (!name) {
        tokens.push({ type: "text", value: html.slice(i, end + 1) });
        i = end + 1;
        continue;
      }
      const attrSrc = spaceAt === -1 ? "" : body.slice(spaceAt);
      const tag: Tag = {
        name,
        attrs: parseAttrs(attrSrc),
        selfClosing: selfClosing || VOID_TAGS.has(name),
        closing,
      };
      tokens.push({ type: "tag", value: html.slice(i, end + 1), tag });
      i = end + 1;
      continue;
    }
    // Text run up to the next tag.
    const next = html.indexOf("<", i);
    const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
    tokens.push({ type: "text", value: chunk });
    i = next === -1 ? html.length : next;
  }
  return tokens;
}

interface ListFrame {
  type: "ul" | "ol";
  index: number;
  items: string[];
}

interface TableFrame {
  rows: string[][];
  inRow: boolean;
  inCell: boolean;
  cell: string[];
  headerRow: boolean;
  hasHeader: boolean;
}

export function convertHtml(input: string): ConvertResult {
  // Strip the entire <head> first — it's noise for LLMs.
  const noHead = input.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");

  const tokens = tokenize(noHead);
  const out: string[] = [];
  let buffer = ""; // current inline paragraph
  const listStack: ListFrame[] = [];
  // Pending hrefs for open <a> tags, so we can emit `[label](href)` at close.
  const hrefStack: string[] = [];
  let inPre = false;
  let inCode = false;
  let codeBuffer = "";
  let skipDepth = 0;
  let skipName: string | null = null;
  let table: TableFrame | null = null;

  const flushPara = (): void => {
    const t = buffer.replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, " ").trim();
    if (t) out.push(t);
    buffer = "";
  };

  const writeText = (text: string): void => {
    if (skipDepth > 0) return;
    if (inPre || inCode) {
      codeBuffer += text;
      return;
    }
    if (table?.inCell) {
      table.cell.push(text);
      return;
    }
    buffer += text;
  };

  const listIndent = (): string => "  ".repeat(Math.max(0, listStack.length - 1));

  for (const tok of tokens) {
    if (tok.type === "text") {
      writeText(decodeEntities(tok.value));
      continue;
    }
    const tag = tok.tag!;

    if (skipDepth > 0) {
      if (tag.closing && tag.name === skipName) {
        skipDepth--;
        if (skipDepth === 0) skipName = null;
      } else if (!tag.closing && !tag.selfClosing && tag.name === skipName) {
        skipDepth++;
      }
      continue;
    }
    if (!tag.closing && SKIP_BLOCKS.has(tag.name)) {
      if (!tag.selfClosing) {
        skipDepth = 1;
        skipName = tag.name;
      }
      continue;
    }

    switch (tag.name) {
      case "br":
        if (inPre || inCode) codeBuffer += "\n";
        else if (table?.inCell) table.cell.push(" ");
        else buffer += "  \n";
        break;
      case "hr":
        flushPara();
        out.push("---");
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        if (tag.closing) {
          const level = parseInt(tag.name.slice(1), 10);
          const text = buffer.replace(/\s+/g, " ").trim();
          buffer = "";
          if (text) out.push("#".repeat(level) + " " + text);
        } else {
          flushPara();
        }
        break;
      case "p":
      case "div":
      case "section":
      case "article":
      case "header":
      case "footer":
      case "main":
      case "aside":
        if (!tag.closing && !tag.selfClosing) flushPara();
        else if (tag.closing) flushPara();
        break;
      case "blockquote":
        if (tag.closing) {
          const t = buffer.replace(/\s+/g, " ").trim();
          buffer = "";
          if (t) out.push("> " + t);
        } else {
          flushPara();
        }
        break;
      case "ul":
      case "ol":
        if (!tag.closing) {
          flushPara();
          listStack.push({ type: tag.name, index: 0, items: [] });
        } else if (listStack.length > 0) {
          const frame = listStack.pop()!;
          if (frame.items.length > 0) {
            // Emit the whole list as ONE block so items stay tight (single
            // newline between them) rather than being split into separate
            // paragraphs by the trailing `\n\n` joiner.
            out.push(frame.items.join("\n"));
          }
        }
        break;
      case "li":
        if (!tag.closing) {
          flushPara();
        } else {
          const frame = listStack[listStack.length - 1];
          const text = buffer.replace(/\s+/g, " ").trim();
          buffer = "";
          if (!frame) {
            if (text) out.push("- " + text);
          } else {
            frame.index += 1;
            const marker = frame.type === "ol" ? `${frame.index}.` : "-";
            if (text) frame.items.push(`${listIndent()}${marker} ${text}`);
          }
        }
        break;
      case "a":
        if (!tag.closing) {
          buffer += "[";
          hrefStack.push(tag.attrs.href ?? "");
        } else {
          const href = hrefStack.pop() ?? "";
          buffer += href ? `](${href})` : "]";
        }
        break;
      case "strong":
      case "b":
        buffer += "**";
        break;
      case "em":
      case "i":
        buffer += "*";
        break;
      case "code":
        if (inPre) break;
        if (!tag.closing) {
          inCode = true;
          codeBuffer = "";
        } else {
          inCode = false;
          buffer += "`" + codeBuffer.replace(/`/g, "\\`") + "`";
          codeBuffer = "";
        }
        break;
      case "pre":
        if (!tag.closing) {
          flushPara();
          inPre = true;
          codeBuffer = "";
        } else {
          inPre = false;
          out.push("```\n" + codeBuffer.replace(/```/g, "``\u200b`").trimEnd() + "\n```");
          codeBuffer = "";
        }
        break;
      case "img": {
        const alt = tag.attrs.alt ?? "";
        const src = tag.attrs.src ?? "";
        if (src) buffer += `![${alt}](${src})`;
        break;
      }
      case "table":
        if (!tag.closing) {
          flushPara();
          table = {
            rows: [],
            inRow: false,
            inCell: false,
            cell: [],
            headerRow: false,
            hasHeader: false,
          };
        } else if (table) {
          out.push(renderTable(table));
          table = null;
        }
        break;
      case "thead":
        if (table && !tag.closing) table.headerRow = true;
        else if (table) table.headerRow = false;
        break;
      case "tr":
        if (!tag.closing && table) {
          table.inRow = true;
          table.rows.push([]);
        } else if (tag.closing && table) {
          table.inRow = false;
          if (table.headerRow) table.hasHeader = true;
        }
        break;
      case "th":
        if (table) {
          if (!tag.closing) {
            table.inCell = true;
            table.cell = [];
            if (!table.headerRow) {
              // First row counts as header if <th> appears anywhere in row 0.
              if (table.rows.length === 1) table.hasHeader = true;
            }
          } else {
            table.inCell = false;
            table.rows[table.rows.length - 1].push(
              table.cell.join("").replace(/\s+/g, " ").trim()
            );
          }
        }
        break;
      case "td":
        if (table) {
          if (!tag.closing) {
            table.inCell = true;
            table.cell = [];
          } else {
            table.inCell = false;
            table.rows[table.rows.length - 1].push(
              table.cell.join("").replace(/\s+/g, " ").trim()
            );
          }
        }
        break;
      case "body":
      case "html":
      case "span":
        // Transparent — treat as no-op for layout purposes.
        break;
      default:
        // Unknown tag → skip silently.
        break;
    }
  }
  flushPara();

  const md = out
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    markdown: md,
    format: "html",
    notes: [],
  };
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderTable(t: TableFrame): string {
  const rows = t.rows.filter((r) => r.length > 0);
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = r.map(escapeCell);
    while (copy.length < width) copy.push("");
    return copy;
  });
  if (t.hasHeader) {
    const [header, ...body] = padded;
    const sep = header.map(() => "---");
    return [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...body.map((r) => `| ${r.join(" | ")} |`),
    ].join("\n");
  }
  // No explicit header — synthesize a blank one so Markdown stays valid.
  const sep = Array.from({ length: width }, () => "---");
  return [
    `| ${Array.from({ length: width }, (_, i) => `col ${i + 1}`).join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...padded.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
