import type { DragEvent } from 'react';

interface UsePointDragOptions {
  index: number;
  onPointSwap?: (dragIndex: number, dropIndex: number) => void;
  dragScope?: string;
}

/**
 * Stateless HTML5 drag-and-drop for reordering points within a visualization.
 * Spread the returned props onto each draggable point div.
 */
export function usePointDrag({ index, onPointSwap, dragScope }: UsePointDragOptions) {
  if (!onPointSwap) return { draggable: false } as const;

  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', index.toString());
      if (dragScope) e.dataTransfer.setData('dragScope', dragScope);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragScope && e.dataTransfer.getData('dragScope') !== dragScope) return;
      const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
      if (!isNaN(dragIndex) && dragIndex !== index) {
        onPointSwap(dragIndex, index);
      }
    },
  } as const;
}
