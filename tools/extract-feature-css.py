"""Keeps only rules that style feature components from the pre-0.13 stylesheet.
Shell rules (window, bars, columns, reader frame, docks, archive grid) are dropped; the new shell lives in style.css."""
import re, sys
src = open(sys.argv[1]).read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
FEATURE = re.compile(r'\.(speak-|excerpt-|facet-|identity-|translation-|replacement-|temporary-|feature-|request-|settings-card|preferences|reference-|lore-|pick-list|history-|input-history|input-shelf|series-list|series-row|side-dialog|archive-organizer|token-options|viewer-controls|help\b|reasoning-|preset-manage|prompt-tabs|prompt-full|fixed-rules|dialog-fields|dialog-empty|list-heading|book-columns|backup-actions|st-current|selected-tags|selected-chat|section-title|compose-section|inner-options|continuation-modes|tool-group|result-tool|tool-disclosure|png-inner|icon-close|icon-only|inline-error|empty-small|text-action|danger-action|check\b|field\b|hint\b|landing|specimen|issue\b|waiting|spinner|editor\b|raw\b|prose\b|reading-copy|reading-status|reading-options|followup)')
SHELL = re.compile(r'\.(window|topbar|top-actions|work-folder|tagline|task-indicator|main\b|workspace|composer|compose-scroll|compose-heading|compose-more|generate-area|mode-picker|mobile-|reader\b|reader-bar|reader-heading|reader-meta|reader-tools|result-actions|result-bottom|footer|status-link|shelf|compact-shelf|shelf-card|card-open|card-icons|archive-(?!organizer)|page-heading|side-toast|flat-row|wide\b)|:host|^\s*\*|^\s*\.app\b(?![-\w])\s*(\{|$)|^\s*(html|body|button|input|select|textarea|h1|h2|h3|p|small)\b')
def blocks(text):
    i, out = 0, []
    while i < len(text):
        j = text.find('{', i)
        if j < 0: break
        head = text[i:j].strip()
        depth, k = 1, j + 1
        while depth and k < len(text):
            depth += text[k] == '{'; depth -= text[k] == '}'; k += 1
        out.append((head, text[j+1:k-1])); i = k
    return out
def keep_rule(head):
    sels = [s.strip() for s in head.split(',') if s.strip()]
    good = [s for s in sels if FEATURE.search(s) and not SHELL.search(s)]
    return ','.join(good) if good else None
out = []
for head, body in blocks(src):
    if head.startswith('@media') or head.startswith('@supports'):
        inner = []
        for h2, b2 in blocks(body):
            k = keep_rule(h2)
            if k: inner.append(f'{k}{{{b2}}}')
        if inner: out.append(f'{head}{{{"".join(inner)}}}')
    elif head.startswith('@keyframes'):
        out.append(f'{head}{{{body}}}')
    elif not head.startswith('@'):
        k = keep_rule(head)
        if k: out.append(f'{k}{{{body}}}')
sys.stdout.write('\n'.join(out) + '\n')
