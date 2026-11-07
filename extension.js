'use strict';

const vscode = require('vscode');
const { rules } = require('./rules');

function indentUnit() {
  const e = vscode.window.activeTextEditor;
  if (e && e.options.insertSpaces === false) return '\t';
  const n = e && typeof e.options.tabSize === 'number' ? e.options.tabSize : 2;
  return ' '.repeat(n);
}

function clamp(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function activate(context) {
  const provider = {
    provideInlineCompletionItems(document, position, inlineCtx) {
      const cfg = vscode.workspace.getConfiguration('absolutesolvermz.suggestions');
      if (!cfg.get('enabled', true)) return undefined;
      if (inlineCtx && inlineCtx.selectedCompletionInfo) return undefined;

      const lineText = document.lineAt(position.line).text;
      const ctx = {
        lang: document.languageId,
        lineIndex: position.line,
        lineCount: document.lineCount,
        lineText,
        before: lineText.slice(0, position.character),
        after: lineText.slice(position.character),
        indent: lineText.match(/^\s*/)[0],
        unit: indentUnit(),
        getLine: (i) => (i >= 0 && i < document.lineCount ? document.lineAt(i).text : undefined),
        text: () => document.getText(),
        cfg: {
          imageCount: clamp(cfg.get('imageCount', 3), 2, 20, 3),
          listItemCount: clamp(cfg.get('listItemCount', 3), 2, 20, 3),
        },
      };

      for (const rule of rules) {
        if (rule.langs && !rule.langs.includes(ctx.lang)) continue;
        let text = null;
        try {
          text = rule.run(ctx);
        } catch (e) {
          text = null;
        }
        if (text) {
          return [new vscode.InlineCompletionItem(text, new vscode.Range(position, position))];
        }
      }
      return undefined;
    },
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
