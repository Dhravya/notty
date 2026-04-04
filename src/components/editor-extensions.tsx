import {
    StarterKit,
    TiptapLink,
    Placeholder,
    TaskList,
    TaskItem,
    HorizontalRule,
    CharacterCount,
    TiptapUnderline,
    HighlightExtension,
    CustomKeymap,
    GlobalDragHandle,
    Command,
    createSuggestionItems,
    renderItems,
} from "novel";
import {
    Heading1Icon,
    Heading2Icon,
    Heading3Icon,
    ListIcon,
    ListOrderedIcon,
    ListTodoIcon,
    QuoteIcon,
    MinusIcon,
    CodeXmlIcon,
    TextIcon,
} from "lucide-react";

export const suggestionItems = createSuggestionItems([
    {
        title: "Text",
        description: "Plain text paragraph",
        icon: <TextIcon size={18} />,
        searchTerms: ["p", "paragraph"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
        },
    },
    {
        title: "Heading 1",
        description: "Large section heading",
        icon: <Heading1Icon size={18} />,
        searchTerms: ["title", "big", "large"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
        },
    },
    {
        title: "Heading 2",
        description: "Medium section heading",
        icon: <Heading2Icon size={18} />,
        searchTerms: ["subtitle", "medium"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
        },
    },
    {
        title: "Heading 3",
        description: "Small section heading",
        icon: <Heading3Icon size={18} />,
        searchTerms: ["subtitle", "small"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
        },
    },
    {
        title: "Bullet List",
        description: "Unordered list",
        icon: <ListIcon size={18} />,
        searchTerms: ["unordered", "list", "bullet"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run();
        },
    },
    {
        title: "Numbered List",
        description: "Ordered list",
        icon: <ListOrderedIcon size={18} />,
        searchTerms: ["ordered", "list", "number"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        },
    },
    {
        title: "To-do List",
        description: "Track tasks with checkboxes",
        icon: <ListTodoIcon size={18} />,
        searchTerms: ["todo", "task", "checkbox"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleTaskList().run();
        },
    },
    {
        title: "Quote",
        description: "Block quote",
        icon: <QuoteIcon size={18} />,
        searchTerms: ["blockquote", "quote"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        },
    },
    {
        title: "Code Block",
        description: "Code with syntax highlighting",
        icon: <CodeXmlIcon size={18} />,
        searchTerms: ["code", "codeblock"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        },
    },
    {
        title: "Divider",
        description: "Horizontal rule",
        icon: <MinusIcon size={18} />,
        searchTerms: ["hr", "divider", "separator"],
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        },
    },
]);

const slashCommand = Command.configure({
    suggestion: {
        items: () => suggestionItems,
        render: renderItems,
    },
});

export const extensions = [
    StarterKit.configure({
        history: false, // Yjs handles undo/redo
        bulletList: { HTMLAttributes: { class: "list-disc list-outside leading-3 -mt-2" } },
        orderedList: { HTMLAttributes: { class: "list-decimal list-outside leading-3 -mt-2" } },
        listItem: { HTMLAttributes: { class: "leading-normal -mb-2" } },
        blockquote: { HTMLAttributes: { class: "border-l-4 border-[var(--color-accent)]" } },
        code: { HTMLAttributes: { class: "rounded-md bg-[var(--color-border-warm)] px-1.5 py-1 font-mono text-sm" } },
        horizontalRule: false,
        codeBlock: { HTMLAttributes: { class: "rounded-lg bg-[var(--color-paper)] border border-[var(--color-border-warm)] p-4 font-mono text-sm" } },
        dropcursor: { color: "#2DD4BF", width: 3 },
    }),
    TiptapLink.configure({
        HTMLAttributes: {
            class: "text-[var(--color-accent)] underline underline-offset-[3px] hover:brightness-110 cursor-pointer",
        },
    }),
    Placeholder.configure({
        placeholder: ({ node }) => {
            if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
            return "Press '/' for commands...";
        },
    }),
    TaskList.configure({ HTMLAttributes: { class: "not-prose" } }),
    TaskItem.configure({ nested: true }),
    HorizontalRule,
    CharacterCount,
    TiptapUnderline,
    HighlightExtension,
    CustomKeymap,
    GlobalDragHandle,
    slashCommand,
];
