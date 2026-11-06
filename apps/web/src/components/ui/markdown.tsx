import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/** Renders admin-editable Markdown safely (no raw HTML). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-club text-[15px] text-ink/90', className)}>
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children: linkChildren }) => {
            const external = !!href && /^https?:/.test(href);
            return (
              <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
                {linkChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
