/**
 * Shared panel icon used by both the sidebar and the top-right SMFS toggle.
 * Extracted so the SVG only lives in one place (DRY).
 */
export function PanelIcon({ size = 16, className, style }: { size?: number; className?: string; style?: React.CSSProperties }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={style}
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
    );
}
