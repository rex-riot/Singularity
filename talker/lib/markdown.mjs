// Turns Markdown into plain text to speak. This is the crude Phase-1 version:
// it only strips syntax. Later, the real parser will turn Markdown into
// performance directions (emphasis, pauses, expressions) instead.

export function stripMarkdown(md) {
  let t = md.replace(/\r/g, '');
  t = t.replace(/^---\n[\s\S]*?\n---\n/, '');            // frontmatter
  t = t.replace(/```[\s\S]*?```/g, '');                   // fenced code: skipped
  t = t.replace(/<[^>]+>/g, '');                          // html tags
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');             // images: skipped
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'); // [[wikilinks]]
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');          // links: keep the text
  t = t.replace(/`([^`]*)`/g, '$1');                      // inline code
  t = t.replace(/(\*\*|__)(.+?)\1/g, '$2');               // bold
  t = t.replace(/\*(.+?)\*/g, '$1');                      // italic
  t = t.replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2');        // italic with underscores

  const lines = t.split('\n').map(line => {
    // Headings and list items often have no final punctuation; add a period
    // so the voice pauses after them.
    const block = /^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+)/.test(line);
    let s = line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/^\s*>\s?/, '').trim();
    if (block && s && !/[.!?:;…]$/.test(s)) s += '.';
    return s;
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
