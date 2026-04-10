'use client';

import { motion } from 'framer-motion';
import { TripTemplate } from '@/data/tripTemplates';

interface TripTemplatesSectionProps {
  templates: TripTemplate[];
  onUseTemplate: (template: TripTemplate) => void;
}

export default function TripTemplatesSection({ templates, onUseTemplate }: TripTemplatesSectionProps) {
  return (
    <div className="mt-8">
      <h2 className="font-display text-sm font-bold text-text-primary mb-3">Start from a template</h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
        {templates.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className="bg-bg-card border border-border-subtle rounded-xl p-4 min-w-[240px] max-w-[240px] flex-shrink-0 hover:border-accent-cyan/40 transition-all cursor-pointer flex flex-col"
            onClick={() => onUseTemplate(t)}
          >
            {/* Emoji */}
            <div className="text-3xl mb-2">{t.image}</div>

            {/* Title & description */}
            <h3 className="font-display font-bold text-sm text-text-primary leading-tight">{t.title}</h3>
            <p className="text-text-muted text-[11px] font-body mt-1 leading-snug line-clamp-2">{t.description}</p>

            {/* Duration & budget */}
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-accent-cyan text-[10px] font-mono">{t.duration}</span>
              <span className="text-text-muted text-[10px]">&middot;</span>
              <span className="text-text-secondary text-[10px] font-mono">{t.budget}</span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mt-2.5">
              {t.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan text-[9px] font-body"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Use Template button */}
            <div className="mt-auto pt-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUseTemplate(t);
                }}
                className="w-full bg-accent-cyan/10 text-accent-cyan font-display font-bold text-[11px] px-3 py-1.5 rounded-lg hover:bg-accent-cyan/20 transition-colors"
              >
                Use Template
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
