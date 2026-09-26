// The 11 move classification categories: id, German label (Chess.com naming
// where one exists), badge icon and color, from best to worst. FORCED is a
// contextual fact (the only legal reply to a check) rather than a quality
// judgment - like BOOK, it overrides whatever quality bucket the move would
// otherwise fall into (see js/analysis/classification.js).

export const CATEGORIES = {
  BRILLIANT: { id: 'BRILLIANT', label: 'Brilliant', icon: 'icons/svg/brilliant.svg', color: '#4BC2A3' },
  GREAT: { id: 'GREAT', label: 'Großartig', icon: 'icons/svg/great_find.svg', color: '#7A9CBF' },
  BEST: { id: 'BEST', label: 'Perfekt', icon: 'icons/svg/best.svg', color: '#86B54C' },
  EXCELLENT: { id: 'EXCELLENT', label: 'Exzellent', icon: 'icons/svg/excellent.svg', color: '#86B54C' },
  GOOD: { id: 'GOOD', label: 'Gut', icon: 'icons/svg/good.svg', color: '#98B676' },
  BOOK: { id: 'BOOK', label: 'Theoriezug', icon: 'icons/svg/book.svg', color: '#D0A37C' },
  FORCED: { id: 'FORCED', label: 'Erzwungen', icon: 'icons/svg/forced.svg', color: '#96AF8B' },
  INACCURACY: { id: 'INACCURACY', label: 'Ungenau', icon: 'icons/svg/inaccuracy.svg', color: '#F1C42C' },
  MISTAKE: { id: 'MISTAKE', label: 'Fehler', icon: 'icons/svg/mistake.svg', color: '#F7A256' },
  MISS: { id: 'MISS', label: 'Verpasst', icon: 'icons/svg/incorrect.svg', color: '#F57467' },
  BLUNDER: { id: 'BLUNDER', label: 'Patzer', icon: 'icons/svg/blunder.svg', color: '#EF3B27' },
};

export const CATEGORY_ORDER = [
  'BRILLIANT', 'GREAT', 'BEST', 'EXCELLENT', 'GOOD', 'BOOK', 'FORCED',
  'INACCURACY', 'MISTAKE', 'MISS', 'BLUNDER',
];
