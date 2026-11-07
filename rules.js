'use strict';

/*
 * AbsoluteSolverMz - reglas de sugerencias (se aceptan con Tab).
 *
 * Cada regla es { id, langs, run(ctx) }.
 *  - langs: lenguajes donde aplica (si falta, aplica en todos).
 *  - run(ctx): devuelve el TEXTO que se inserta justo después del cursor, o null si no sugiere nada.
 *
 * Para agregar una sugerencia nueva, copiá una regla de abajo y adaptala.
 */

const MARKUP = ['html', 'django-html', 'jinja-html', 'vue', 'php', 'javascriptreact', 'typescriptreact'];
const HTMLISH = ['html', 'django-html', 'jinja-html', 'vue', 'php'];
const JS = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue'];
const DJANGO = ['django-html', 'html', 'jinja-html'];

const IMG_LINE = /^<img\b[^>]*>$/i;
const LI_LINE = /^<li\b[^>]*>.*<\/li>$/i;

// ---------- utilidades ----------
function indentLen(s) {
  return s.match(/^\s*/)[0].length;
}

function nextNonEmpty(ctx) {
  for (let i = ctx.lineIndex + 1; i < ctx.lineCount; i++) {
    const t = ctx.getLine(i);
    if (t !== undefined && t.trim() !== '') return t;
  }
  return null;
}

// Cuántas líneas seguidas (hacia arriba, incluyendo la actual) cumplen la expresión
function runUp(ctx, re) {
  let n = 0;
  for (let i = ctx.lineIndex; i >= 0; i--) {
    const t = ctx.getLine(i);
    if (t !== undefined && re.test(t.trim())) n++;
    else break;
  }
  return n;
}

// "foto1.jpg" + 1 -> "foto2.jpg" (conserva ceros: img_001 -> img_002). Sin números -> null
function bumpLastNumber(str, k) {
  let found = false;
  const out = str.replace(/(\d+)(?!.*\d)/, (m) => {
    found = true;
    return String(Number(m) + k).padStart(m.length, '0');
  });
  return found ? out : null;
}

function nextSrc(val, k, pos) {
  const bumped = bumpLastNumber(val, k);
  if (bumped) return bumped;
  const m = /^(.*?)(\.[A-Za-z0-9]+)$/.exec(val);
  if (m && m[1]) return m[1] + (pos + k) + m[2];
  return 'imagen' + (pos + k) + '.jpg';
}

function nextAlt(val, k, pos) {
  return bumpLastNumber(val, k) || (val + ' ' + (pos + k));
}

function cloneImg(tag, k, pos) {
  if (!/\bsrc\s*=/i.test(tag)) {
    return '<img src="imagen' + (pos + k) + '.jpg" alt="Imagen ' + (pos + k) + '">';
  }
  return tag
    .replace(/(\bsrc\s*=\s*)(["'])(.*?)\2/i, (m, p, q, v) => p + q + nextSrc(v, k, pos) + q)
    .replace(/(\balt\s*=\s*)(["'])(.*?)\2/i, (m, p, q, v) =>
      v.trim() === '' ? m : p + q + nextAlt(v, k, pos) + q
    );
}

// Sugiere el cuerpo + la etiqueta de cierre de un bloque recién abierto.
// Maneja que el editor ya haya autocerrado la etiqueta (<ul>|</ul>).
function wrapBody(ctx, closeText, closeRe, bodyLines, existsRe) {
  const { after, indent, unit, lineText } = ctx;
  const body = bodyLines.map((l) => indent + unit + l).join('\n');
  const next = nextNonEmpty(ctx);

  if (after.trim() === '') {
    if (next) {
      if (indentLen(next) > indentLen(lineText)) return null; // ya tiene contenido adentro
      if (existsRe && existsRe.test(next.trim())) return null;
    }
    const hasClose = next && closeRe.test(next.trim());
    return '\n' + body + (hasClose ? '' : '\n' + indent + closeText);
  }
  if (closeRe.test(after.trim())) return '\n' + body + '\n' + indent;
  return null;
}

// ---------- reglas ----------
const rules = [
  {
    id: 'imagenes-restantes',
    langs: MARKUP,
    run(ctx) {
      const t = ctx.lineText.trim();
      if (!IMG_LINE.test(t) || ctx.after.trim() !== '') return null;
      const total = ctx.cfg.imageCount;
      const n = runUp(ctx, IMG_LINE);
      if (n >= total) return null;
      const next = ctx.getLine(ctx.lineIndex + 1);
      if (next !== undefined && IMG_LINE.test(next.trim())) return null;
      const out = [];
      for (let k = 1; k <= total - n; k++) out.push(ctx.indent + cloneImg(t, k, n));
      return '\n' + out.join('\n');
    },
  },
  {
    id: 'items-de-lista-restantes',
    langs: HTMLISH,
    run(ctx) {
      const t = ctx.lineText.trim();
      if (!LI_LINE.test(t) || ctx.after.trim() !== '') return null;
      const total = ctx.cfg.listItemCount;
      const n = runUp(ctx, LI_LINE);
      if (n >= total) return null;
      const next = ctx.getLine(ctx.lineIndex + 1);
      if (next !== undefined && LI_LINE.test(next.trim())) return null;
      const out = [];
      for (let k = 1; k <= total - n; k++) out.push(ctx.indent + '<li>Elemento ' + (n + k) + '</li>');
      return '\n' + out.join('\n');
    },
  },
  {
    id: 'lista-ul-ol',
    langs: HTMLISH,
    run(ctx) {
      const m = /^<(ul|ol)\b[^>]*>$/i.exec(ctx.before.trim());
      if (!m) return null;
      const tag = m[1].toLowerCase();
      const items = [];
      for (let i = 1; i <= ctx.cfg.listItemCount; i++) items.push('<li>Elemento ' + i + '</li>');
      return wrapBody(ctx, '</' + tag + '>', new RegExp('^</' + tag + '\\s*>', 'i'), items, /^<li\b/i);
    },
  },
  {
    id: 'formulario',
    langs: HTMLISH,
    run(ctx) {
      if (!/^<form\b[^>]*>$/i.test(ctx.before.trim())) return null;
      const body = [];
      if (ctx.lang === 'django-html') body.push('{% csrf_token %}');
      body.push(
        '<label for="nombre">Nombre</label>',
        '<input type="text" id="nombre" name="nombre">',
        '<button type="submit">Enviar</button>'
      );
      return wrapBody(ctx, '</form>', /^<\/form\s*>/i, body, null);
    },
  },
  {
    id: 'meta-viewport-y-title',
    langs: HTMLISH,
    run(ctx) {
      if (!/^<meta\s+charset=["'][^"']+["']\s*\/?>$/i.test(ctx.before.trim())) return null;
      if (ctx.after.trim() !== '') return null;
      const text = ctx.text();
      const out = [];
      if (!/name=["']viewport["']/i.test(text)) {
        out.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
      }
      if (!/<title[\s>]/i.test(text)) out.push('<title>Mi página</title>');
      if (!out.length) return null;
      return '\n' + out.map((l) => ctx.indent + l).join('\n');
    },
  },
  {
    id: 'django-for',
    langs: DJANGO,
    run(ctx) {
      const m = /^\{%\s*for\s+(\w+)\s+in\s+.+%\}$/.exec(ctx.before.trim());
      if (!m) return null;
      return wrapBody(ctx, '{% endfor %}', /^\{%\s*endfor\s*%\}/, ['{{ ' + m[1] + ' }}'], null);
    },
  },
  {
    id: 'django-if',
    langs: DJANGO,
    run(ctx) {
      if (!/^\{%\s*if\s+.+%\}$/.test(ctx.before.trim())) return null;
      return wrapBody(ctx, '{% endif %}', /^\{%\s*endif\s*%\}/, ['<p>Contenido</p>'], null);
    },
  },
  {
    id: 'django-block',
    langs: DJANGO,
    run(ctx) {
      if (!/^\{%\s*block\s+\w+\s*%\}$/.test(ctx.before.trim())) return null;
      return wrapBody(ctx, '{% endblock %}', /^\{%\s*endblock\b/, ['<p>Contenido</p>'], null);
    },
  },
  {
    id: 'js-addeventlistener',
    langs: JS,
    run(ctx) {
      const DECL = /^(?:const|let|var)\s+(\w+)\s*=\s*document\.(?:querySelector|getElementById)\(.+\);?$/;
      const m = DECL.exec(ctx.before.trim());
      if (!m || ctx.after.trim() !== '') return null;
      const name = m[1];
      if (ctx.text().includes(name + '.addEventListener')) return null;
      const next = nextNonEmpty(ctx);
      if (next && DECL.test(next.trim())) return null;
      const i = ctx.indent;
      const u = ctx.unit;
      return '\n\n' + [
        i + name + '.addEventListener("click", () => {',
        i + u + 'console.log("click en ' + name + '");',
        i + '});',
      ].join('\n');
    },
  },
  {
    id: 'python-try-except',
    langs: ['python'],
    run(ctx) {
      if (ctx.before.trim() !== 'try:' || ctx.after.trim() !== '') return null;
      const next = nextNonEmpty(ctx);
      if (next && indentLen(next) > indentLen(ctx.lineText)) return null;
      const i = ctx.indent;
      const u = ctx.unit;
      return '\n' + [i + u + 'pass', i + 'except Exception as e:', i + u + 'print(e)'].join('\n');
    },
  },
];

module.exports = { rules };
