/**
 * PptxRenderer — PowerPoint (.pptx) slaytlarını aslına sadık çizer.
 *
 * Yaklaşım: ppt/slides/slideN.xml içindeki DrawingML şekilleri okunur,
 * konum (a:off/a:ext, EMU cinsinden), metin puntoları, renkler, hizalama,
 * resim kırpma (a:srcRect) ve dönüş (rot) birebir kullanılarak bir SVG
 * üretilir. SVG tarayıcıda rasterleştirilip PNG olarak diske yazılır.
 *
 * Ayrıca slide → slideLayout → slideMaster zinciri çözülür: slayttaki
 * metinler çoğunlukla "placeholder"dır ve gerçek konum/font bilgisi
 * layout/master dosyalarındadır. Arka plan ve dekoratif şekiller de
 * o katmanlardan gelir.
 *
 * ÖNEMLİ: SVG çıktısı PİKSEL uzayında üretilir. Chromium SVG'de çok büyük
 * `font-size` değerlerini kırpıyor; EMU uzayında yazı boyutları yüz binlere
 * çıkıyor ve metin okunamayacak kadar küçük çiziliyordu.
 *
 * Kullanım:
 *   const urls = await PptxRenderer.renderSlides(file, { onProgress });
 */
(function () {
  'use strict';

  // 1 inç = 914400 EMU, 1 px (96 dpi) = 9525 EMU
  const EMU_PER_PX = 9525;
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /** EMU → px (SVG çıktısı için). */
  const u = (emu) => {
    const v = emu / EMU_PER_PX;
    return (Math.round(v * 100) / 100).toString();
  };

  function parseXml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function kids(el, ns, tag) {
    if (!el) return [];
    const out = [];
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i];
      if ((c.localName === tag) && (!ns || c.namespaceURI === ns)) out.push(c);
    }
    return out;
  }

  function all(el, ns, tag) {
    if (!el) return [];
    return Array.prototype.slice.call(el.getElementsByTagNameNS(ns, tag));
  }

  function first(el, ns, tag) {
    const list = all(el, ns, tag);
    return list.length ? list[0] : null;
  }

  function num(el, attr, def) {
    if (!el) return def;
    const v = el.getAttribute(attr);
    if (v === null) return def;
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------------- renkler

  const THEME_KEYS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

  function parseTheme(xmlText) {
    const map = {};
    if (!xmlText) return map;
    const doc = parseXml(xmlText);
    const scheme = first(doc, A, 'clrScheme');
    if (!scheme) return map;
    THEME_KEYS.forEach((key) => {
      const node = kids(scheme, A, key)[0];
      if (!node) return;
      const srgb = kids(node, A, 'srgbClr')[0];
      const sys = kids(node, A, 'sysClr')[0];
      if (srgb) map[key] = '#' + srgb.getAttribute('val');
      else if (sys) map[key] = '#' + (sys.getAttribute('lastClr') || '000000');
    });
    map.tx1 = map.dk1;
    map.bg1 = map.lt1;
    map.tx2 = map.dk2;
    map.bg2 = map.lt2;
    return map;
  }

  function colorFromNode(node, theme) {
    if (!node) return null;
    theme = theme || {};
    const srgb = kids(node, A, 'srgbClr')[0];
    if (srgb) {
      const v = srgb.getAttribute('val') || '000000';
      const alphaNode = kids(srgb, A, 'alpha')[0];
      const alpha = alphaNode ? num(alphaNode, 'val', 100000) / 100000 : 1;
      let color = '#' + v;
      const lumMod = kids(srgb, A, 'lumMod')[0];
      const lumOff = kids(srgb, A, 'lumOff')[0];
      if (lumMod || lumOff) {
        const f = lumMod ? num(lumMod, 'val', 100000) / 100000 : 1;
        const off = lumOff ? num(lumOff, 'val', 0) / 100000 : 0;
        color = shade(color, f, off);
      }
      return { color: color, alpha: alpha };
    }
    const scheme = kids(node, A, 'schemeClr')[0];
    if (scheme) {
      const val = scheme.getAttribute('val');
      let base = theme[val] || (val === 'tx1' ? '#000000' : val === 'bg1' ? '#ffffff' : '#000000');
      const lumMod = kids(scheme, A, 'lumMod')[0];
      const lumOff = kids(scheme, A, 'lumOff')[0];
      if (lumMod || lumOff) {
        const f = lumMod ? num(lumMod, 'val', 100000) / 100000 : 1;
        const off = lumOff ? num(lumOff, 'val', 0) / 100000 : 0;
        base = shade(base, f, off);
      }
      const alphaNode = kids(scheme, A, 'alpha')[0];
      const alpha = alphaNode ? num(alphaNode, 'val', 100000) / 100000 : 1;
      return { color: base, alpha: alpha };
    }
    const prst = kids(node, A, 'prstClr')[0];
    if (prst) {
      const named = {
        black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
        blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080',
        orange: '#ffa500', purple: '#800080', darkBlue: '#00008b', lightGray: '#d3d3d3'
      };
      return { color: named[prst.getAttribute('val')] || '#000000', alpha: 1 };
    }
    return null;
  }

  function hexToRgb(h) {
    const s = String(h).replace('#', '');
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
  }

  function shade(hex, factor, offset) {
    const [r, g, b] = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * factor + 255 * offset)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function ptToEmu(pt) { return pt * 12700; }

  // ------------------------------------------------------------------ metin

  function charWidthFactor(ch, bold) {
    if (ch === ' ') return 0.28;
    if ("iIl.,:;!|'’".indexOf(ch) > -1) return 0.28;
    if ('mwMWŞşÖöĞğÜüÇç'.indexOf(ch) > -1) return 0.86;
    if (ch >= '0' && ch <= '9') return 0.56;
    const upper = ch.toUpperCase();
    if (upper === ch && ch.toLowerCase() !== ch) return bold ? 0.68 : 0.64;
    return bold ? 0.58 : 0.53;
  }

  function textWidthEmu(str, fontEmu, bold) {
    let w = 0;
    for (let i = 0; i < str.length; i++) w += charWidthFactor(str[i], bold) * fontEmu;
    return w;
  }

  function runStyle(rPr, theme, defaults) {
    const style = {
      size: defaults.size,
      bold: defaults.bold,
      italic: false,
      underline: false,
      color: defaults.color,
      font: defaults.font
    };
    if (!rPr) return style;

    const sz = rPr.getAttribute('sz');
    if (sz) style.size = ptToEmu(parseFloat(sz) / 100);
    const b = rPr.getAttribute('b');
    if (b !== null) style.bold = (b === '1' || b === 'true');
    const it = rPr.getAttribute('i');
    if (it !== null) style.italic = (it === '1' || it === 'true');
    const un = rPr.getAttribute('u');
    if (un && un !== 'none') style.underline = true;

    const fill = kids(rPr, A, 'solidFill')[0];
    if (fill) {
      const c = colorFromNode(fill, theme);
      if (c) style.color = c.color;
    }
    const latin = kids(rPr, A, 'latin')[0];
    if (latin && latin.getAttribute('typeface')) style.font = latin.getAttribute('typeface');
    const cs = kids(rPr, A, 'cs')[0];
    if (!latin && cs && cs.getAttribute('typeface')) style.font = cs.getAttribute('typeface');
    return style;
  }

  /**
   * txBody → SVG metin bloğu. box EMU cinsindendir; çıktı px'e çevrilir.
   */
  function renderTextBody(txBody, box, theme, opts) {
    if (!txBody) return '';
    opts = opts || {};
    const bodyPr = kids(txBody, A, 'bodyPr')[0];
    const lIns = num(bodyPr, 'lIns', 91440);
    const rIns = num(bodyPr, 'rIns', 91440);
    const tIns = num(bodyPr, 'tIns', 45720);
    const bIns = num(bodyPr, 'bIns', 45720);
    const anchor = (bodyPr && bodyPr.getAttribute('anchor')) || 't';
    const wrap = (bodyPr && bodyPr.getAttribute('wrap')) || 'square';

    const paras = kids(txBody, A, 'p');
    if (!paras.length) return '';

    const availW = Math.max(0, box.w - lIns - rIns);
    const defSize = ptToEmu(opts.defaultSizePt || 18);
    const defaults = {
      size: defSize,
      bold: false,
      color: opts.defaultColor || '#000000',
      font: opts.defaultFont || 'Arial'
    };

    const lines = [];
    paraLoop:
    for (let pi = 0; pi < paras.length; pi++) {
      const p = paras[pi];
      const pPr = kids(p, A, 'pPr')[0];
      const algn = (pPr && pPr.getAttribute('algn')) || 'l';
      const marL = num(pPr, 'marL', 0);
      const indent = num(pPr, 'indent', 0);
      const lnSpcNode = pPr ? kids(pPr, A, 'lnSpc')[0] : null;
      let lnPct = 1;
      if (lnSpcNode) {
        const pct = kids(lnSpcNode, A, 'spcPct')[0];
        if (pct) lnPct = num(pct, 'val', 100000) / 100000;
      }
      const spcBef = pPr ? kids(pPr, A, 'spcBef')[0] : null;
      const spcAft = pPr ? kids(pPr, A, 'spcAft')[0] : null;
      const befPts = spcBef ? kids(spcBef, A, 'spcPts')[0] : null;
      const aftPts = spcAft ? kids(spcAft, A, 'spcPts')[0] : null;
      const beforeEmu = befPts ? ptToEmu(num(befPts, 'val', 0) / 100) : 0;
      const afterEmu = aftPts ? ptToEmu(num(aftPts, 'val', 0) / 100) : 0;

      const buChar = pPr ? kids(pPr, A, 'buChar')[0] : null;
      const buNone = pPr ? kids(pPr, A, 'buNone')[0] : null;
      const bullet = (buChar && !buNone) ? (buChar.getAttribute('char') || '•') : '';

      const segs = [];
      kids(p, A, 'r').forEach((r) => {
        const tNode = kids(r, A, 't')[0];
        const text = tNode ? tNode.textContent : '';
        if (!text) return;
        segs.push({ text: text, style: runStyle(kids(r, A, 'rPr')[0], theme, defaults) });
      });
      kids(p, A, 'fld').forEach((f) => {
        const tNode = kids(f, A, 't')[0];
        const text = tNode ? tNode.textContent : '';
        if (!text) return;
        segs.push({ text: text, style: runStyle(kids(f, A, 'rPr')[0], theme, defaults) });
      });

      if (!segs.length) {
        lines.push({ segs: [], algn, marL, lnPct, beforeEmu: lines.length ? 0 : beforeEmu, afterEmu, bullet: '', maxSize: defaults.size });
        continue;
      }

      const maxSize = segs.reduce((m, s) => Math.max(m, s.style.size), 0);
      const extraIndent = bullet ? Math.abs(indent || 0) : 0;

      if (wrap === 'none') {
        lines.push({ segs, algn, marL: marL + extraIndent, lnPct, beforeEmu, afterEmu, bullet, maxSize });
        continue;
      }

      // Kelimelere ayır
      const words = [];
      segs.forEach((seg) => {
        seg.text.split(/(\s+)/).forEach((part) => {
          if (part !== '') words.push({ text: part, style: seg.style });
        });
      });

      const usableW = Math.max(ptToEmu(10), availW - marL - extraIndent);
      let cur = [];
      let curW = 0;
      let firstOfPara = true;

      const pushLine = () => {
        if (!cur.length && !firstOfPara) return;
        lines.push({
          segs: cur,
          algn,
          marL: marL + extraIndent,
          lnPct,
          beforeEmu: firstOfPara ? beforeEmu : 0,
          afterEmu: afterEmu,
          bullet: firstOfPara ? bullet : '',
          maxSize: cur.reduce((m, s) => Math.max(m, s.style.size), maxSize)
        });
        cur = [];
        curW = 0;
        firstOfPara = false;
      };

      for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi];
        const isSpace = /^\s+$/.test(word.text);
        const w = textWidthEmu(word.text, word.style.size, word.style.bold);
        if (!isSpace && curW + w > usableW && cur.length) pushLine();
        if (isSpace && !cur.length) continue;
        cur.push(word);
        curW += w;
      }
      pushLine();
    }

    if (!lines.length) return '';

    let totalH = 0;
    lines.forEach((ln) => {
      ln.lineH = (ln.maxSize || defSize) * 1.2 * (ln.lnPct || 1);
      totalH += ln.lineH + (ln.beforeEmu || 0) + (ln.afterEmu || 0);
    });

    let startY = box.y + tIns;
    if (anchor === 'ctr') startY = box.y + (box.h - totalH) / 2;
    else if (anchor === 'b') startY = box.y + box.h - bIns - totalH;

    let svg = '';
    let y = startY;

    lines.forEach((ln) => {
      y += (ln.beforeEmu || 0);
      const size = ln.maxSize || defSize;
      // Baseline: yazı tipi yüksekliğinin ~%80'i
      const baseline = y + size * 0.82;
      y += ln.lineH;

      const segs = ln.segs || [];
      if (!segs.length) { y += (ln.afterEmu || 0); return; }

      let x = box.x + lIns + (ln.marL || 0);
      let anchorAttr = 'start';
      if (ln.algn === 'ctr') { x = box.x + lIns + (availW / 2); anchorAttr = 'middle'; }
      else if (ln.algn === 'r') { x = box.x + box.w - rIns; anchorAttr = 'end'; }

      // Madde işareti
      if (ln.bullet) {
        const bx = box.x + lIns + (ln.marL || 0) - ptToEmu(14);
        svg += `<text x="${u(bx)}" y="${u(baseline)}" font-family="Arial" font-size="${u(size)}"` +
          ` fill="#333333" text-anchor="start">${esc(ln.bullet)}</text>`;
      }

      // Run'lar tek satırda birleştirilsin (tspan'ler arası boşluk kaybını da korur)
      let spans = '';
      segs.forEach((seg) => {
        const st = seg.style;
        const attrs = [
          `fill="${st.color}"`,
          `font-weight="${st.bold ? 'bold' : 'normal'}"`,
          `font-style="${st.italic ? 'italic' : 'normal'}"`,
          `font-family="${esc(st.font || 'Arial')}"`
        ];
        if (st.underline) attrs.push('text-decoration="underline"');
        // tspan'de font-size da verilmeli: run'lar farklı puntolarda olabilir
        attrs.push(`font-size="${u(st.size)}"`);
        spans += `<tspan ${attrs.join(' ')}>${esc(seg.text)}</tspan>`;
      });

      svg += `<text x="${u(x)}" y="${u(baseline)}" font-size="${u(size)}"` +
        ` text-anchor="${anchorAttr}" xml:space="preserve">${spans}</text>`;
      y += (ln.afterEmu || 0);
    });

    return svg;
  }

  // ----------------------------------------------------------------- şekiller

  function shapeGeom(prst, x, y, w, h) {
    const p = String(prst || 'rect').toLowerCase();
    if (p === 'ellipse' || p === 'circle') {
      return `<ellipse cx="${u(x + w / 2)}" cy="${u(y + h / 2)}" rx="${u(w / 2)}" ry="${u(h / 2)}"`;
    }
    if (p.indexOf('round') === 0 || p === 'roundrect') {
      const r = Math.min(w, h) * 0.12;
      return `<rect x="${u(x)}" y="${u(y)}" width="${u(w)}" height="${u(h)}" rx="${u(r)}" ry="${u(r)}"`;
    }
    if (p === 'line' || p === 'straightconnector1') {
      return `<line x1="${u(x)}" y1="${u(y)}" x2="${u(x + w)}" y2="${u(y + h)}"`;
    }
    return `<rect x="${u(x)}" y="${u(y)}" width="${u(w)}" height="${u(h)}"`;
  }

  function shapeFillAttrs(spPr, theme) {
    if (!spPr) return ' fill="none"';
    if (kids(spPr, A, 'noFill')[0]) return ' fill="none"';
    const solid = kids(spPr, A, 'solidFill')[0];
    if (solid) {
      const c = colorFromNode(solid, theme);
      if (c) return ` fill="${c.color}"${c.alpha < 1 ? ` fill-opacity="${c.alpha}"` : ''}`;
    }
    const grad = kids(spPr, A, 'gradFill')[0];
    if (grad) {
      const stops = all(grad, A, 'gs');
      if (stops.length) {
        const c = colorFromNode(stops[0], theme);
        if (c) return ` fill="${c.color}"${c.alpha < 1 ? ` fill-opacity="${c.alpha}"` : ''}`;
      }
    }
    return ' fill="none"';
  }

  function shapeLineAttrs(spPr, theme) {
    const ln = spPr ? kids(spPr, A, 'ln')[0] : null;
    if (!ln) return '';
    if (kids(ln, A, 'noFill')[0]) return ' stroke="none"';
    const solid = kids(ln, A, 'solidFill')[0];
    const c = solid ? colorFromNode(solid, theme) : null;
    if (!c) return '';
    const w = num(ln, 'w', 12700);
    return ` stroke="${c.color}" stroke-width="${u(Math.max(w, 6350))}"`;
  }

  function xfrmOf(el) {
    if (!el) return null;
    const xf = kids(el, A, 'xfrm')[0];
    if (!xf) return null;
    const off = kids(xf, A, 'off')[0];
    const ext = kids(xf, A, 'ext')[0];
    if (!off || !ext) return null;
    const chOff = kids(xf, A, 'chOff')[0];
    const chExt = kids(xf, A, 'chExt')[0];
    return {
      x: num(off, 'x', 0),
      y: num(off, 'y', 0),
      w: num(ext, 'cx', 0),
      h: num(ext, 'cy', 0),
      rot: num(xf, 'rot', 0) / 60000,
      flipH: xf.getAttribute('flipH') === '1',
      flipV: xf.getAttribute('flipV') === '1',
      chOff: chOff ? { x: num(chOff, 'x', 0), y: num(chOff, 'y', 0) } : null,
      chExt: chExt ? { w: num(chExt, 'cx', 1), h: num(chExt, 'cy', 1) } : null
    };
  }

  function rotTransform(xf) {
    if (!xf || (!xf.rot && !xf.flipH && !xf.flipV)) return '';
    const cx = xf.x + xf.w / 2;
    const cy = xf.y + xf.h / 2;
    let t = '';
    if (xf.rot) t += ` rotate(${xf.rot.toFixed(2)} ${u(cx)} ${u(cy)})`;
    if (xf.flipH) t += ` translate(${u(2 * cx)} 0) scale(-1 1)`;
    if (xf.flipV) t += ` translate(0 ${u(2 * cy)}) scale(1 -1)`;
    return t ? ` transform="${t.trim()}"` : '';
  }

  // ------------------------------------- layout / master placeholder çözümü

  function phKey(node) {
    if (!node) return null;
    const ph = first(node, P, 'ph');
    if (!ph) return null;
    const type = ph.getAttribute('type') || 'body';
    const idx = ph.getAttribute('idx');
    return `${type}|${idx === null ? '' : idx}`;
  }

  function collectPlaceholders(doc) {
    const map = new Map();
    const spTree = first(doc, P, 'spTree');
    if (!spTree) return map;
    kids(spTree, P, 'sp').forEach((sp) => {
      const nv = kids(sp, P, 'nvSpPr')[0];
      const key = phKey(nv);
      if (!key) return;
      map.set(key, {
        xfrm: xfrmOf(kids(sp, P, 'spPr')[0]),
        spPr: kids(sp, P, 'spPr')[0],
        txBody: kids(sp, P, 'txBody')[0]
      });
    });
    return map;
  }

  function resolveXfrm(own, layoutPh, masterPh) {
    if (own) return own;
    if (layoutPh && layoutPh.xfrm) return layoutPh.xfrm;
    if (masterPh && masterPh.xfrm) return masterPh.xfrm;
    return null;
  }

  /** Placeholder'ın varsayılan punto (pt): layout → master txStyles. */
  function defaultSizeFor(key, layoutPh, masterStyles) {
    if (layoutPh && layoutPh.txBody) {
      const lst = kids(layoutPh.txBody, A, 'lstStyle')[0];
      const lvl = lst ? kids(lst, A, 'lvl1pPr')[0] : null;
      const def = lvl ? kids(lvl, A, 'defRPr')[0] : null;
      if (def && def.getAttribute('sz')) return parseFloat(def.getAttribute('sz')) / 100;
    }
    const type = String(key || '').split('|')[0];
    if (masterStyles) {
      if (/title/i.test(type)) return masterStyles.title;
      if (type === 'body' || type === 'subTitle' || type === 'obj') return masterStyles.body;
      return masterStyles.other;
    }
    return 18;
  }

  function parseMasterStyles(masterDoc) {
    if (!masterDoc) return null;
    const txStyles = first(masterDoc, P, 'txStyles');
    if (!txStyles) return null;
    const read = (tag, fallback) => {
      const node = kids(txStyles, P, tag)[0];
      if (!node) return fallback;
      const lvl = kids(node, A, 'lvl1pPr')[0];
      const def = lvl ? kids(lvl, A, 'defRPr')[0] : null;
      if (def && def.getAttribute('sz')) return parseFloat(def.getAttribute('sz')) / 100;
      return fallback;
    };
    return {
      title: read('titleStyle', 40),
      body: read('bodyStyle', 18),
      other: read('otherStyle', 18)
    };
  }

  // ------------------------------------------------------------- slayt parçaları

  async function readRels(zip, partPath) {
    const dir = partPath.substring(0, partPath.lastIndexOf('/'));
    const file = partPath.substring(partPath.lastIndexOf('/') + 1);
    const entry = zip.file(`${dir}/_rels/${file}.rels`);
    if (!entry) return {};
    const doc = parseXml(await entry.async('string'));
    const map = {};
    const rels = doc.getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i++) {
      const r = rels[i];
      map[r.getAttribute('Id')] = {
        target: r.getAttribute('Target') || '',
        type: r.getAttribute('Type') || '',
        external: r.getAttribute('TargetMode') === 'External'
      };
    }
    return map;
  }

  function resolveTarget(partPath, target) {
    if (!target) return '';
    if (target.charAt(0) === '/') return target.slice(1);
    const dir = partPath.substring(0, partPath.lastIndexOf('/'));
    const parts = (dir + '/' + target).split('/');
    const stack = [];
    parts.forEach((p) => {
      if (p === '..') stack.pop();
      else if (p !== '.') stack.push(p);
    });
    return stack.join('/');
  }

  async function imageDataUri(zip, path) {
    const entry = zip.file(path);
    if (!entry) return null;
    const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = ({
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
      webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff'
    })[ext];
    if (!mime) return null; // EMF/WMF tarayıcıda çizilemez
    const b64 = await entry.async('base64');
    return { uri: `data:${mime};base64,${b64}` };
  }

  function renderPic(pic, rels, theme, imageCache) {
    const spPr = kids(pic, P, 'spPr')[0];
    const xf = xfrmOf(spPr);
    if (!xf) return '';
    const blipFill = kids(pic, P, 'blipFill')[0];
    const blip = blipFill ? kids(blipFill, A, 'blip')[0] : null;
    const embed = blip ? blip.getAttributeNS(R, 'embed') : null;
    const rel = embed ? rels[embed] : null;
    if (!rel) return '';

    const img = imageCache.get(rel.target);
    if (!img) return '';

    const srcRect = blipFill ? kids(blipFill, A, 'srcRect')[0] : null;
    const cl = num(srcRect, 'l', 0) / 100000;
    const ct = num(srcRect, 't', 0) / 100000;
    const cr = num(srcRect, 'r', 0) / 100000;
    const cb = num(srcRect, 'b', 0) / 100000;

    const clipId = 'c' + Math.random().toString(36).slice(2, 9);
    const hasCrop = cl || ct || cr || cb;
    return `<g${rotTransform(xf)}>` +
      (hasCrop ? `<defs><clipPath id="${clipId}"><rect x="${u(xf.x)}" y="${u(xf.y)}" width="${u(xf.w)}" height="${u(xf.h)}"/></clipPath></defs>` : '') +
      `<image ${hasCrop ? `clip-path="url(#${clipId})" ` : ''}x="${u(xf.x)}" y="${u(xf.y)}"` +
      ` width="${u(xf.w)}" height="${u(xf.h)}" preserveAspectRatio="none" href="${img.uri}"/>` +
      `</g>`;
  }

  function renderShape(sp, theme, fallbackSizePt, rels, imageCache, layoutPhMap, masterPhMap, masterStyles) {
    const spPr = kids(sp, P, 'spPr')[0];
    const nv = kids(sp, P, 'nvSpPr')[0];
    const key = phKey(nv);

    const layoutPh = key ? (layoutPhMap && layoutPhMap.get(key)) : null;
    const masterPh = key ? (masterPhMap && masterPhMap.get(key)) : null;
    const ownXfrm = xfrmOf(spPr);
    const xf = resolveXfrm(ownXfrm, layoutPh, masterPh);

    const txBody = kids(sp, P, 'txBody')[0];
    if (!xf) return '';

    const styleSpPr = (spPr && (kids(spPr, A, 'solidFill')[0] || kids(spPr, A, 'ln')[0]))
      ? spPr
      : ((layoutPh && layoutPh.spPr) || spPr);

    const prstGeom = styleSpPr ? kids(styleSpPr, A, 'prstGeom')[0] : null;
    const prst = prstGeom ? prstGeom.getAttribute('prst') : null;

    const fillAttrs = shapeFillAttrs(styleSpPr, theme);
    const lineAttrs = shapeLineAttrs(styleSpPr, theme);

    const defPt = key ? defaultSizeFor(key, layoutPh, masterStyles) : fallbackSizePt;

    let out = `<g${rotTransform(xf)}>`;
    const hasFill = fillAttrs.indexOf('fill="none"') === -1;
    const hasStroke = lineAttrs && lineAttrs.indexOf('stroke="none"') === -1;
    // Placeholder kutusu genelde görünmez (yalnızca metin taşır)
    if (hasFill || hasStroke) {
      out += shapeGeom(prst, xf.x, xf.y, xf.w, xf.h) + fillAttrs + lineAttrs + ' />';
    }
    if (txBody) {
      out += renderTextBody(txBody, { x: xf.x, y: xf.y, w: xf.w, h: xf.h }, theme, {
        defaultSizePt: defPt,
        defaultColor: '#000000'
      });
    }
    out += '</g>';
    return out;
  }

  function renderGroup(grpSp, rels, theme, imageCache, fallbackSizePt) {
    const grpSpPr = kids(grpSp, P, 'grpSpPr')[0];
    const xf = xfrmOf(grpSpPr);
    let inner = '';
    Array.prototype.slice.call(grpSp.children).forEach((child) => {
      const ln = child.localName;
      if (ln === 'sp') inner += renderShape(child, theme, fallbackSizePt, rels, imageCache, null, null, null);
      else if (ln === 'pic') inner += renderPic(child, rels, theme, imageCache);
      else if (ln === 'grpSp') inner += renderGroup(child, rels, theme, imageCache, fallbackSizePt);
      else if (ln === 'graphicFrame') inner += renderGraphicFrame(child, rels, theme, imageCache, fallbackSizePt);
    });
    if (!xf || !xf.chOff || !xf.chExt) return `<g>${inner}</g>`;

    const sx = xf.chExt.w ? xf.w / xf.chExt.w : 1;
    const sy = xf.chExt.h ? xf.h / xf.chExt.h : 1;
    return `<g transform="translate(${u(xf.x)} ${u(xf.y)}) scale(${sx.toFixed(5)} ${sy.toFixed(5)})"` +
      ` data-gx="${u(xf.chOff.x)}" data-gy="${u(xf.chOff.y)}">` +
      `<g transform="translate(${u(-xf.chOff.x)} ${u(-xf.chOff.y)})">${inner}</g></g>`;
  }

  function renderGraphicFrame(gf, rels, theme, imageCache, fallbackSizePt) {
    const xf = xfrmOf(kids(gf, P, 'xfrm')[0]);
    const tbl = first(gf, A, 'tbl');
    if (!tbl || !xf) return '';

    const gridCols = kids(tbl, A, 'gridCol').map(c => num(c, 'w', 0));
    const rows = kids(tbl, A, 'tr');
    let out = '<g>';
    let y = xf.y;
    rows.forEach((tr) => {
      const h = num(tr, 'h', 0);
      let x = xf.x;
      kids(tr, A, 'tc').forEach((tc, ci) => {
        const w = gridCols[ci] || 0;
        const tcPr = kids(tc, A, 'tcPr')[0];
        const fillNode = tcPr ? kids(tcPr, A, 'solidFill')[0] : null;
        const c = fillNode ? colorFromNode(fillNode, theme) : null;
        out += `<rect x="${u(x)}" y="${u(y)}" width="${u(w)}" height="${u(h)}"` +
          ` fill="${c ? c.color : '#ffffff'}" stroke="#b0b8c4" stroke-width="1"/>`;
        const txBody = kids(tc, A, 'txBody')[0];
        if (txBody) {
          out += renderTextBody(txBody, { x: x, y: y, w: w, h: h }, theme, {
            defaultSizePt: 14, defaultColor: '#000000'
          });
        }
        x += w;
      });
      y += h;
    });
    out += '</g>';
    return out;
  }

  function renderBackground(bg, rels, theme, imageCache) {
    if (!bg) return '';
    const bgPr = kids(bg, P, 'bgPr')[0];
    if (bgPr) {
      const solid = kids(bgPr, A, 'solidFill')[0];
      if (solid) {
        const c = colorFromNode(solid, theme);
        if (c) return `<rect x="0" y="0" width="100%" height="100%" fill="${c.color}"/>`;
      }
      const grad = kids(bgPr, A, 'gradFill')[0];
      if (grad) {
        const stops = all(grad, A, 'gs');
        if (stops.length) {
          const c = colorFromNode(stops[0], theme);
          if (c) return `<rect x="0" y="0" width="100%" height="100%" fill="${c.color}"/>`;
        }
      }
      const blipFill = kids(bgPr, A, 'blipFill')[0];
      if (blipFill) {
        const blip = kids(blipFill, A, 'blip')[0];
        const embed = blip ? blip.getAttributeNS(R, 'embed') : null;
        const rel = embed ? rels[embed] : null;
        const img = rel ? imageCache.get(rel.target) : null;
        if (img) return `<image x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" href="${img.uri}"/>`;
      }
    }
    const bgRef = kids(bg, P, 'bgRef')[0];
    if (bgRef) {
      const c = colorFromNode(bgRef, theme);
      if (c) return `<rect x="0" y="0" width="100%" height="100%" fill="${c.color}"/>`;
    }
    return '';
  }

  // ---------------------------------------------------------------- slayt SVG

  async function renderSlideSvg(zip, slidePath, ctx) {
    const doc = parseXml(await zip.file(slidePath).async('string'));
    const rels = await readRels(zip, slidePath);

    // --- Layout ve master zinciri ---
    let layoutDoc = null, layoutPath = null, layoutPhMap = new Map();
    let masterDoc = null, masterPath = null, masterPhMap = new Map();
    let masterStyles = null, layoutRels = {};

    for (const id of Object.keys(rels)) {
      if (/slideLayout/i.test(rels[id].type)) {
        layoutPath = resolveTarget(slidePath, rels[id].target);
        break;
      }
    }
    if (layoutPath && zip.file(layoutPath)) {
      layoutDoc = parseXml(await zip.file(layoutPath).async('string'));
      layoutPhMap = collectPlaceholders(layoutDoc);
      layoutRels = await readRels(zip, layoutPath);
      for (const id of Object.keys(layoutRels)) {
        if (/slideMaster/i.test(layoutRels[id].type)) {
          masterPath = resolveTarget(layoutPath, layoutRels[id].target);
          if (zip.file(masterPath)) {
            masterDoc = parseXml(await zip.file(masterPath).async('string'));
            masterPhMap = collectPlaceholders(masterDoc);
            masterStyles = parseMasterStyles(masterDoc);
          }
          break;
        }
      }
    }

    // --- Resim havuzu (slayt + layout + master) ---
    const imageCache = new Map();
    const collectImages = async (relsMap, basePath) => {
      for (const id of Object.keys(relsMap)) {
        const rel = relsMap[id];
        if (rel.external || !/image/i.test(rel.type)) continue;
        const target = resolveTarget(basePath, rel.target);
        if (imageCache.has(target)) continue;
        const data = await imageDataUri(zip, target);
        if (!data) continue;
        let dims = { width: 100, height: 100 };
        try { dims = await ctx.measureImage(data.uri); } catch (e) {}
        imageCache.set(target, { uri: data.uri, width: dims.width, height: dims.height });
      }
    };
    await collectImages(rels, slidePath);
    if (layoutPath) await collectImages(layoutRels, layoutPath);
    if (masterPath) await collectImages(await readRels(zip, masterPath), masterPath);

    // --- Katmanlar: master → layout → slayt ---
    let body = '';
    const masterRels = masterPath ? await readRels(zip, masterPath) : {};

    const drawLayer = (layerDoc, layerRels2, phMap, skipPlaceholders) => {
      const spTree = first(layerDoc, P, 'spTree');
      if (!spTree) return;
      Array.prototype.slice.call(spTree.children).forEach((el) => {
        const ln = el.localName;
        if (ln === 'sp') {
          const key = phKey(kids(el, P, 'nvSpPr')[0]);
          if (key && skipPlaceholders) return;
          body += renderShape(el, ctx.theme, 18, layerRels2, imageCache, phMap, masterPhMap, masterStyles);
        } else if (ln === 'pic') {
          body += renderPic(el, layerRels2, ctx.theme, imageCache);
        } else if (ln === 'grpSp') {
          body += renderGroup(el, layerRels2, ctx.theme, imageCache, 18);
        } else if (ln === 'graphicFrame') {
          body += renderGraphicFrame(el, layerRels2, ctx.theme, imageCache, 18);
        }
      });
    };

    let masterBg = '';
    if (masterDoc) {
      masterBg = renderBackground(first(masterDoc, P, 'bg'), masterRels, ctx.theme, imageCache);
      drawLayer(masterDoc, masterRels, masterPhMap, true);
    }
    let layoutBg = '';
    if (layoutDoc) {
      layoutBg = renderBackground(first(layoutDoc, P, 'bg'), layoutRels, ctx.theme, imageCache);
      drawLayer(layoutDoc, layoutRels, layoutPhMap, true);
    }

    const spTree = first(doc, P, 'spTree');
    if (spTree) {
      Array.prototype.slice.call(spTree.children).forEach((el) => {
        const ln = el.localName;
        if (ln === 'sp') {
          body += renderShape(el, ctx.theme, 18, rels, imageCache, layoutPhMap, masterPhMap, masterStyles);
        } else if (ln === 'pic') {
          body += renderPic(el, rels, ctx.theme, imageCache);
        } else if (ln === 'grpSp') {
          body += renderGroup(el, rels, ctx.theme, imageCache, 18);
        } else if (ln === 'graphicFrame') {
          body += renderGraphicFrame(el, rels, ctx.theme, imageCache, 18);
        }
      });
    }

    const ownBg = renderBackground(first(doc, P, 'bg'), rels, ctx.theme, imageCache);
    const bgSvg = ownBg || layoutBg || masterBg ||
      `<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>`;

    const wPx = ctx.slideW / EMU_PER_PX;
    const hPx = ctx.slideH / EMU_PER_PX;

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
      ` width="${Math.round(wPx)}" height="${Math.round(hPx)}"` +
      ` viewBox="0 0 ${Math.round(wPx)} ${Math.round(hPx)}" preserveAspectRatio="xMidYMid meet">` +
      bgSvg + body + '</svg>';
  }

  // ------------------------------------------------------------- rasterleştirme

  function measureImage(uri) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 100, height: img.naturalHeight || 100 });
      img.onerror = () => reject(new Error('görsel açılamadı'));
      img.src = uri;
    });
  }

  function rasterize(svg, widthPx, heightPx, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(widthPx * scale);
          canvas.height = Math.round(heightPx * scale);
          const c = canvas.getContext('2d');
          c.fillStyle = '#ffffff';
          c.fillRect(0, 0, canvas.width, canvas.height);
          c.imageSmoothingQuality = 'high';
          c.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('SVG rasterleştirilemedi'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /**
   * .pptx dosyasını slayt görsellerine çevirir.
   * @returns {Promise<string[]>} slayt sırasıyla görsel URL'leri
   */
  async function renderSlides(file, options) {
    options = options || {};
    if (typeof window.JSZip === 'undefined') throw new Error('JSZip yüklü değil');

    const zip = await window.JSZip.loadAsync(file);

    // Slayt boyutu
    let slideW = 12192000;
    let slideH = 6858000;
    const presEntry = zip.file('ppt/presentation.xml');
    if (presEntry) {
      const presDoc = parseXml(await presEntry.async('string'));
      const sldSz = first(presDoc, P, 'sldSz');
      if (sldSz) {
        slideW = num(sldSz, 'cx', slideW);
        slideH = num(sldSz, 'cy', slideH);
      }
    }

    // Tema
    let theme = {};
    const themeEntry = zip.file('ppt/theme/theme1.xml');
    if (themeEntry) theme = parseTheme(await themeEntry.async('string'));

    // Slayt sırası
    const presRels = await readRels(zip, 'ppt/presentation.xml');
    const order = [];
    if (presEntry) {
      const presDoc = parseXml(await presEntry.async('string'));
      const idLst = first(presDoc, P, 'sldIdLst');
      if (idLst) {
        kids(idLst, P, 'sldId').forEach((node) => {
          const rid = node.getAttributeNS(R, 'id');
          const rel = presRels[rid];
          if (rel) order.push(resolveTarget('ppt/presentation.xml', rel.target));
        });
      }
    }
    if (!order.length) {
      order.push.apply(order, Object.keys(zip.files)
        .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)));
    }

    const ctx = { slideW: slideW, slideH: slideH, theme: theme, measureImage: measureImage };
    const widthPx = slideW / EMU_PER_PX;
    const heightPx = slideH / EMU_PER_PX;
    const scale = Math.min(3, Math.max(2, 1920 / Math.max(1, widthPx)));

    const urls = [];
    for (let i = 0; i < order.length; i++) {
      if (typeof options.onProgress === 'function') options.onProgress(i + 1, order.length);
      try {
        const svg = await renderSlideSvg(zip, order[i], ctx);
        const dataUrl = await rasterize(svg, widthPx, heightPx, scale);
        let saved = null;
        try {
          if (window.MD && typeof window.MD.dataUrlToAsset === 'function') {
            saved = await window.MD.dataUrlToAsset(dataUrl, `slayt_${i + 1}.jpg`);
          }
        } catch (e) {}
        urls.push(saved || dataUrl);
      } catch (e) {
        console.warn('[PptxRenderer] slayt çizilemedi:', order[i], e);
      }
    }
    if (!urls.length) throw new Error('Hiçbir slayt çizilemedi');
    return urls;
  }

  window.PptxRenderer = {
    renderSlides: renderSlides,
    _internal: {
      parseXml: parseXml,
      parseTheme: parseTheme,
      renderTextBody: renderTextBody,
      renderShape: renderShape,
      renderSlideSvg: renderSlideSvg,
      EMU_PER_PX: EMU_PER_PX
    }
  };
})();
