import { Mark, mergeAttributes } from '@tiptap/core';

export const SemanticMark = Mark.create({
  name: 'semanticMark',
  
  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-semantic-id]' }];
  },

renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-semantic-id': HTMLAttributes.id,
      // Rimosse le classi di transizione (transition-transform, hover:-translate-y, hover:drop-shadow)
      class: 'bg-white text-gray-900 box-decoration-clone px-1 py-1 mx-[2px] leading-none font-bold cursor-pointer relative z-10',
      style: 'filter: drop-shadow(2px 0 0 #111827) drop-shadow(-2px 0 0 #111827) drop-shadow(0 2px 0 #111827) drop-shadow(0 -2px 0 #111827);'
    }), 0];
  },
});