import React from 'react';
import { useStore } from '../store/useStore';

export default function GlossaryView() {
  const glossaryTerms = useStore((state) => state.glossaryTerms) || [];
  const updateGlossaryDefinition = useStore((state) => state.updateGlossaryDefinition);
  const removeGlossaryTerm = useStore((state) => state.removeGlossaryTerm);

  const sortedTerms = [...glossaryTerms].sort((a, b) => a.word.localeCompare(b.word));

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-y-auto p-8">

      {sortedTerms.length === 0 ? (
        <p className="font-mono text-gray-500">Nessun termine presente. Estrapola dal testo.</p>
      ) : (
        <div className="flex flex-col gap-10 w-full">
          {sortedTerms.map((term) => (
            
            <div key={term.id} className="flex flex-col group w-full overflow-hidden">
              
              <div className="flex justify-between items-start mb-2 w-full gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xl text-gray-900 break-all break-words m-0">
                    {term.word}
                  </h3>
                </div>
                
                <button
                  onClick={() => removeGlossaryTerm(term.id)}
                  className="text-gray-300 hover:text-red-600 font-bold transition-opacity opacity-0 group-hover:opacity-100 shrink-0 mt-1"
                  title="Eradica termine"
                >
                  ✕
                </button>
              </div>
              
              <div className="w-full min-w-0 flex flex-col">
                <textarea
                  value={term.definition}
                  rows={1}
                  /* IL MOTORE DI AUTOLIVELLAMENTO ISTANTANEO */
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  onChange={(e) => updateGlossaryDefinition(term.id, e.target.value)}
                  placeholder="Redigi la definizione qui..."
                  className="w-full outline-none resize-none font-serif text-gray-700 leading-relaxed bg-transparent break-all break-words overflow-hidden"
                />
              </div>
              
            </div>
          ))}
        </div>
      )}
    </div>
  );
}