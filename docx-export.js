/* =============================================================================
   docx-export.js — Builds a Pages-compatible Broadsheet .docx Document object.
   Environment-agnostic: returns a docx.Document. The caller packs it:
     Node    : Packer.toBuffer(doc)  -> fs.writeFileSync
     Browser : Packer.toBlob(doc)    -> download
   Requires the `docx` library to be provided by the caller (Node require or
   browser global), so this file stays free of import specifics.
   ============================================================================= */

(function (root, factory) {
  const RULES = (typeof require !== "undefined") ? require("./rules.js") : root.VVRULES;
  const api = factory(RULES);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.VVDOCX = api;
})(typeof self !== "undefined" ? self : this, function (RULES) {

  /* Build the Broadsheet document.
     docx  : the docx library object (require("docx") or window.docx)
     opts  : { title, byline, mode, voiceLabel, body }
             body = full draft text. Lines starting with "# " become section
             titles; lines starting with "## " become subheads; blank-line
             separated blocks become body paragraphs.                          */
  function build(docx, opts) {
    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
      Header, Footer, PageNumber, BorderStyle, convertInchesToTwip
    } = docx;

    const ACCENT = RULES.broadsheet.accentColor;   // "8B1A1A"
    const FONT = RULES.broadsheet.bodyFont;         // "Georgia"
    const title = opts.title || "Untitled";
    const byline = opts.byline || "";

    const children = [];

    // Masthead title
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: title.toUpperCase(), font: FONT, size: 44, bold: true, color: ACCENT })]
    }));
    // Rule under masthead
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } },
      spacing: { after: 120 }, children: []
    }));
    if (byline) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 240 },
        children: [new TextRun({ text: byline, font: FONT, size: 20, italics: true, color: "555555" })]
      }));
    }

    // Body: parse the draft text
    const blocks = (opts.body || "").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    blocks.forEach(block => {
      const line = block.replace(/\n/g, " ").trim();
      if (/^#\s+/.test(block)) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 120 },
          children: [new TextRun({ text: block.replace(/^#\s+/, ""), font: FONT, size: 30, bold: true, color: ACCENT })]
        }));
      } else if (/^##\s+/.test(block)) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: block.replace(/^##\s+/, ""), font: FONT, size: 24, bold: true, italics: true, color: "333333" })]
        }));
      } else {
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 300 },
          children: [new TextRun({ text: line, font: FONT, size: 23, color: "1A1A1A" })]
        }));
      }
    });

    const runningHead = new Header({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 2 } },
        children: [new TextRun({ text: title.toUpperCase(), font: FONT, size: 16, color: ACCENT, characterSpacing: 40 })]
      })]
    });
    const runningFoot = new Footer({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "555555" })]
      })]
    });

    return new Document({
      creator: "Voluntary or Violence Engine",
      title,
      styles: {
        default: { document: { run: { font: FONT, size: 23 } } }
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1), bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.1), right: convertInchesToTwip(1.1)
            }
          }
        },
        headers: { default: runningHead },
        footers: { default: runningFoot },
        children
      }]
    });
  }

  return { build };
});
