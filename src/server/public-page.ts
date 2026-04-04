// Server-side HTML rendering for public pages — no React, no JS needed for readers

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Convert TipTap JSON content to HTML
// skipFirst: omit the first node (usually the title heading) to avoid duplication
function tiptapToHtml(content: string, skipFirst = false): string {
    try {
        const doc = typeof content === "string" ? JSON.parse(content) : content;
        if (!doc?.content) return "";
        const nodes = skipFirst ? doc.content.slice(1) : doc.content;
        return renderNodes(nodes);
    } catch {
        return escapeHtml(content || "");
    }
}

function renderNodes(nodes: any[]): string {
    return nodes.map(renderNode).join("");
}

function renderNode(node: any): string {
    if (!node) return "";
    const children = node.content ? renderNodes(node.content) : "";

    switch (node.type) {
        case "paragraph":
            return `<p>${children || "<br>"}</p>`;
        case "heading": {
            const level = node.attrs?.level || 2;
            return `<h${level}>${children}</h${level}>`;
        }
        case "text": {
            let text = escapeHtml(node.text || "");
            for (const mark of node.marks || []) {
                switch (mark.type) {
                    case "bold": text = `<strong>${text}</strong>`; break;
                    case "italic": text = `<em>${text}</em>`; break;
                    case "underline": text = `<u>${text}</u>`; break;
                    case "strike": text = `<s>${text}</s>`; break;
                    case "code": text = `<code>${text}</code>`; break;
                    case "link": text = `<a href="${escapeHtml(mark.attrs?.href || "")}" rel="noopener">${text}</a>`; break;
                }
            }
            return text;
        }
        case "bulletList":
            return `<ul>${children}</ul>`;
        case "orderedList":
            return `<ol>${children}</ol>`;
        case "listItem":
            return `<li>${children}</li>`;
        case "blockquote":
            return `<blockquote>${children}</blockquote>`;
        case "codeBlock":
            return `<pre><code>${children}</code></pre>`;
        case "horizontalRule":
            return "<hr>";
        case "hardBreak":
            return "<br>";
        case "image":
            return `<img src="${escapeHtml(node.attrs?.src || "")}" alt="${escapeHtml(node.attrs?.alt || "")}" />`;
        case "taskList":
            return `<ul class="task-list">${children}</ul>`;
        case "taskItem": {
            const checked = node.attrs?.checked ? " checked" : "";
            return `<li><input type="checkbox" disabled${checked}> ${children}</li>`;
        }
        default:
            return children;
    }
}

const BODY_FONTS: Record<string, string> = {
    sans: '"DM Sans", system-ui, sans-serif',
    serif: '"Source Serif 4", Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const HEADING_FONTS: Record<string, string> = {
    sans: '"DM Sans", system-ui, sans-serif',
    serif: '"Instrument Serif", Georgia, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const THEMES = {
    light: {
        paper: "#FAF8F5", ink: "#2C2416", muted: "#8C8474",
        border: "#E2DED6", accent: "#2AA198", card: "#FFFFFF", codeBg: "#F3F0EB",
    },
    dark: {
        paper: "#181715", ink: "#E8E4DC", muted: "#8C8474",
        border: "#333028", accent: "#2AA198", card: "#242220", codeBg: "#2A2826",
    },
};

function buildStyles(font: string, colorMode: string): string {
    const body = BODY_FONTS[font] || BODY_FONTS.serif;
    const heading = HEADING_FONTS[font] || HEADING_FONTS.serif;
    const t = THEMES[colorMode as keyof typeof THEMES] || THEMES.light;
    return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${body}; color: ${t.ink}; background: ${t.paper}; line-height: 1.8; font-size: 1.05rem; }
    .container { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem; }
    header { text-align: center; margin-bottom: 2rem; }
    header h1 { font-family: ${heading}; font-size: 2.2rem; font-weight: 700; margin-bottom: 0.5rem; }
    header p { color: ${t.muted}; font-size: 1rem; }
    .rss-link { display: inline-block; margin-top: 0.75rem; color: ${t.accent}; text-decoration: none; font-size: 0.85rem; }
    .rss-link:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid ${t.border}; margin: 2rem 0; }
    article { margin-bottom: 3rem; }
    article .date { color: ${t.muted}; font-size: 0.85rem; margin-bottom: 0.25rem; }
    article h2 { font-family: ${heading}; font-size: 1.6rem; font-weight: 700; margin-bottom: 0.75rem; }
    article h2 a { color: inherit; text-decoration: none; }
    article h2 a:hover { text-decoration: underline; }
    .content p { margin-bottom: 1em; }
    .content ul, .content ol { margin: 0.5em 0 1em 1.5em; }
    .content blockquote { border-left: 3px solid ${t.border}; padding-left: 1em; color: ${t.muted}; margin: 1em 0; }
    .content pre { background: ${t.codeBg}; padding: 1em; border-radius: 6px; overflow-x: auto; margin: 1em 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
    .content code { background: ${t.codeBg}; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
    .content pre code { background: none; padding: 0; }
    .content img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
    .content a { color: ${t.accent}; }
    .back { display: inline-block; margin-top: 2rem; color: ${t.muted}; text-decoration: none; font-size: 0.85rem; }
    .back:hover { color: ${t.ink}; }
`;
}

function fontLinks(font: string): string {
    if (font === "sans") return '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">';
    if (font === "serif") return `<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" rel="stylesheet">`;
    return "";
}

export function renderPublicPage(profile: any, notes: any[], baseUrl: string): string {
    const title = escapeHtml(profile.page_title || "My Notes");
    const description = escapeHtml(profile.page_description || "");
    const font = profile.font || "serif";
    const colorMode = profile.color_mode || "light";
    const t = THEMES[colorMode as keyof typeof THEMES] || THEMES.light;

    const entries = notes.map((note: any) => {
        const date = note.published_at ? formatDate(note.published_at) : "";
        const noteTitle = escapeHtml(note.title || "Untitled");
        const html = tiptapToHtml(note.content, true);
        const folderName = note.folder_name ? escapeHtml(note.folder_name) : "";
        return `
            <article>
                <div class="date">${[date, folderName].filter(Boolean).join(" · ")}</div>
                <h2><a href="${baseUrl}/${note.id}">${noteTitle}</a></h2>
                <div class="content">${html}</div>
            </article>`;
    }).join("\n<hr>\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="alternate" type="application/rss+xml" title="${title}" href="${baseUrl}/rss">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    ${fontLinks(font)}
    <style>${buildStyles(font, colorMode)}</style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${title}</h1>
            ${description ? `<p>${description}</p>` : ""}
            <a href="${baseUrl}/rss" class="rss-link">RSS Feed</a>
        </header>
        <hr>
        ${entries || `<p style="color:${t.muted};text-align:center;">No published notes yet.</p>`}
    </div>
</body>
</html>`;
}

export function renderPublicNote(profile: any, note: any, baseUrl: string): string {
    const pageTitle = escapeHtml(profile.page_title || "My Notes");
    const noteTitle = escapeHtml(note.title || "Untitled");
    const date = note.published_at ? formatDate(note.published_at) : "";
    const html = tiptapToHtml(note.content, true);
    const font = profile.font || "serif";
    const colorMode = profile.color_mode || "light";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${noteTitle} — ${pageTitle}</title>
    <link rel="alternate" type="application/rss+xml" title="${pageTitle}" href="${baseUrl}/rss">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    ${fontLinks(font)}
    <style>${buildStyles(font, colorMode)}</style>
</head>
<body>
    <div class="container">
        <a href="${baseUrl}" class="back">&larr; ${pageTitle}</a>
        <article style="margin-top: 2rem;">
            ${date ? `<div class="date">${date}</div>` : ""}
            <h2>${noteTitle}</h2>
            <div class="content">${html}</div>
        </article>
    </div>
</body>
</html>`;
}
