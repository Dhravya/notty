function escapeXml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function toRfc822(timestamp: number): string {
    return new Date(timestamp * 1000).toUTCString();
}

function tiptapToPlainHtml(content: string, skipFirst = false): string {
    try {
        const doc = typeof content === "string" ? JSON.parse(content) : content;
        if (!doc?.content) return "";
        const nodes = skipFirst ? doc.content.slice(1) : doc.content;
        return renderNodes(nodes);
    } catch {
        return escapeXml(content || "");
    }
}

function renderNodes(nodes: any[]): string {
    return nodes.map(renderNode).join("");
}

function renderNode(node: any): string {
    if (!node) return "";
    const children = node.content ? renderNodes(node.content) : "";
    switch (node.type) {
        case "paragraph": return `<p>${children}</p>`;
        case "heading": return `<h${node.attrs?.level || 2}>${children}</h${node.attrs?.level || 2}>`;
        case "text": {
            let text = escapeXml(node.text || "");
            for (const mark of node.marks || []) {
                if (mark.type === "bold") text = `<b>${text}</b>`;
                if (mark.type === "italic") text = `<i>${text}</i>`;
            }
            return text;
        }
        case "bulletList": return `<ul>${children}</ul>`;
        case "orderedList": return `<ol>${children}</ol>`;
        case "listItem": return `<li>${children}</li>`;
        case "blockquote": return `<blockquote>${children}</blockquote>`;
        case "codeBlock": return `<pre><code>${children}</code></pre>`;
        case "hardBreak": return "<br/>";
        default: return children;
    }
}

export function renderRSS(profile: any, notes: any[], baseUrl: string): string {
    const title = escapeXml(profile.page_title || "My Notes");
    const description = escapeXml(profile.page_description || "");

    const items = notes.map((note: any) => {
        const noteTitle = escapeXml(note.title || "Untitled");
        const html = tiptapToPlainHtml(note.content, true);
        const pubDate = note.published_at ? toRfc822(note.published_at) : "";
        return `    <item>
      <title>${noteTitle}</title>
      <link>${baseUrl}/${note.id}</link>
      <guid isPermaLink="true">${baseUrl}/${note.id}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
      <description><![CDATA[${html}]]></description>
    </item>`;
    }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${baseUrl}</link>
    <description>${description}</description>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
