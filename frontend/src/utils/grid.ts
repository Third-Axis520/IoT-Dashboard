export const getGridStyle = (count: number) => {
  if (count === 0) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (count === 2) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };
  if (count === 3) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr' };
  if (count === 4) return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 6) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 8) return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (count <= 9) return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  if (count <= 12) return { gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  const cols = Math.ceil(Math.sqrt(count * (16 / 9)));
  const rows = Math.ceil(count / cols);
  return { gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` };
};
