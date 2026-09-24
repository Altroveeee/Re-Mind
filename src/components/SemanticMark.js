import { Mark, mergeAttributes } from '@tiptap/core';

export const SemanticMark = Mark.create({
  name: 'semanticMark',
  
  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'span[data-semantic-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 
      'data-semantic-id': HTMLAttributes.id,
      // Unica classe. Niente stili in linea. Niente confusione.
      class: 'semantic-mark-node' 
    }), 0];
  },
});