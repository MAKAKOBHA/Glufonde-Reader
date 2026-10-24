/*
 * СПИСОК ШРИФТОВ ДЛЯ НАСТРОЕК (файл можно редактировать).
 * Каждая запись:  { id: 'латиницей-без-пробелов', name: 'Название в меню', stack: "CSS-список шрифтов" }
 *   - id    — внутреннее имя (сохраняется в браузере читателя);
 *   - name  — как шрифт называется в «Настройках чтения»;
 *   - stack — значение CSS font-family: сначала сам шрифт, затем запасные.
 * Первый шрифт ('default') — оформление из PDF; его лучше не удалять.
 * Не забудьте добавить @font-face для нового шрифта в fonts.css.
 */
window.GF_FONTS = [
  { id: 'brighton', name: 'Brighton Two Gothika (заголовки)', stack: "'GF Brighton', Georgia, serif" },
  { id: 'default',     name: 'Как в PDF (Times New Roman)', stack: "'Times New Roman', Tinos, 'Liberation Serif', 'Nimbus Roman', Times, 'DejaVu Serif', serif" },
  { id: 'liberation',  name: 'Liberation Serif (с засечками)', stack: "'GF Liberation Serif', 'Times New Roman', serif" },
  { id: 'lora',        name: 'Lora (книжный)', stack: "'GF Lora', Georgia, 'Times New Roman', serif" },
  { id: 'dejavu',      name: 'DejaVu Serif (крупный)', stack: "'GF DejaVu Serif', Georgia, serif" },
  { id: 'sans',        name: 'Liberation Sans (без засечек)', stack: "'GF Liberation Sans', Arial, Helvetica, sans-serif" },
  { id: 'mono',        name: 'Liberation Mono (машинопись)', stack: "'GF Liberation Mono', 'Courier New', monospace" }
];
