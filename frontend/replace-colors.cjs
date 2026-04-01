const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  { regex: /#0A1128/g, replacement: 'var(--bg-root)' },
  { regex: /#0B0F19/g, replacement: 'var(--bg-panel)' },
  { regex: /#111827/g, replacement: 'var(--bg-card)' },
  { regex: /#0D1530/g, replacement: 'var(--bg-trend)' },
  { regex: /#1F2937/g, replacement: 'var(--border-base)' },
  { regex: /#1E293B/g, replacement: 'var(--border-header)' },
  { regex: /#1E2A5E/g, replacement: 'var(--border-trend)' },
  { regex: /#30363D/g, replacement: 'var(--border-input)' },
  { regex: /#F3F4F6/g, replacement: 'var(--text-main)' },
  { regex: /#9CA3AF/g, replacement: 'var(--text-muted)' },
  { regex: /#3B82F6/g, replacement: 'var(--accent-blue)' },
  { regex: /#60A5FA/g, replacement: 'var(--accent-blue-hover)' },
  { regex: /#10B981/g, replacement: 'var(--accent-green)' },
  { regex: /#059669/g, replacement: 'var(--accent-green-hover)' },
  { regex: /#34D399/g, replacement: 'var(--accent-green-light)' },
  { regex: /#EF4444/g, replacement: 'var(--accent-red)' },
  { regex: /#FF4D4D/g, replacement: 'var(--accent-red-light)' },
  { regex: /#FACC15/g, replacement: 'var(--accent-yellow)' },
  { regex: /#FFD700/g, replacement: 'var(--accent-yellow-light)' },
  { regex: /#00F2FF/g, replacement: 'var(--accent-cyan)' },
  { regex: /#F97316/g, replacement: 'var(--accent-orange)' },
  { regex: /#4B5563/g, replacement: 'var(--bg-scrollbar)' },
];

replacements.forEach(({ regex, replacement }) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content);
console.log('Colors replaced in App.tsx');
