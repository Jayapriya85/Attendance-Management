const fs = require('fs');
const path = require('path');

const files = [
  'public/index.html',
  'public/css/style.css',
  'public/js/app.js',
  'public/js/scanner.js',
  'public/js/geofence.js',
  'public/js/idcard.js',
  'public/js/heatmap.js',
  'public/js/api.js',
  'public/js/audio.js',
  'server.js',
  'database/db.js',
  'database/sqlite.js'
];

// Regex for emojis: including surrogate pairs, misc symbols, dingbats, transport symbols, emoticons, etc.
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2B50}\u{23E9}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{1F004}\u{1F0CF}\u{2B05}-\u{2B07}\u{2194}-\u{2199}\u{2934}-\u{2935}\u{3297}\u{3299}\u{303D}\u{3030}\u{24C2}\u{1F201}\u{1F202}\u{1F21A}\u{1F22F}\u{1F232}-\u{1F23A}\u{1F250}\u{1F251}]/gu;

for (const file of files) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, lineNo) => {
      const matches = line.match(emojiRegex);
      if (matches) {
        console.log(`${file}:${lineNo + 1}: ${matches.join(' ')} ---> ${line.trim()}`);
      }
      // Also look for HTML entities like &#... or Unicode bullet/diamond or emojis encoded
      if (line.includes('&#') || line.includes('\\u')) {
        const entityMatches = line.match(/&#\d+;|&#[xX][0-9a-fA-F]+;|\\u[0-9a-fA-F]{4}/g);
        if (entityMatches) {
          // check if they are emojis
          console.log(`[Entity] ${file}:${lineNo + 1}: ${entityMatches.join(' ')} ---> ${line.trim()}`);
        }
      }
    });
  }
}
